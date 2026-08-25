# Architecture — Virtual Communication Coach

## 1. High-level shape

```
Browser (mobile-first React UI)
   │  HTTPS
   ▼
Next.js 15 App Router on Vercel
   ├─ Server Components / Route Handlers / Server Actions
   ├─ src/lib/db          → Supabase Postgres (persistent state, RLS)
   ├─ src/lib/ai          → AIProvider interface → OpenAI | Mock
   ├─ src/lib/voice       → STT/TTS interfaces  → OpenAI | Mock
   ├─ src/lib/simulation  → interlocutor prompt builder + engine
   └─ src/lib/coaching    → evaluation prompt builder + validator
   │
   ▼
Supabase (Postgres + Auth + Row Level Security)
```

Two independent data flows matter most:

```
UI → Practice Session Controller → Simulation Engine → AI Provider   (live role-play)
Practice Session → Transcript → Evaluation Engine → Coach Knowledge → Validated Feedback   (post-session)
Application → Supabase   (all persistence)
```

Vercel hosts stateless request handlers. It never holds conversation state in memory between requests — every turn is a fresh, stateless HTTP request that reads the current session from Postgres, does one unit of work, writes the result back, and returns. This makes the app resilient to serverless cold starts, concurrent tabs, and refreshes.

## 2. Frontend / backend boundary

- **Server Components** (default): fetch tool/scenario libraries, session history, profile — anything read-heavy and non-interactive.
- **Client Components** (`"use client"`): practice setup form, simulation screen (timer, mic, transcript), admin forms, auth forms — anywhere state/interactivity/browser APIs (MediaRecorder, Audio, SpeechRecognition fallback) are required.
- **Route Handlers** (`src/app/api/**/route.ts`): every call that talks to an AI or voice provider, or does multi-step server logic. Keeps provider keys server-side and lets the client `fetch` with normal loading/error states.
- **Server Actions**: simple, single-step mutations tied to a form (creating a session, saving readiness rating, deleting a session, admin CRUD).

No component calls an AI or voice provider directly. No component holds a provider API key.

## 3. Vercel deployment architecture

- Framework preset: Next.js. Build command `next build`, output is the standard `.vercel/output` via the Next.js adapter — no custom server.
- All routes are either static (marketing/login shell), dynamic Server Components (auth-gated pages, `export const dynamic = 'force-dynamic'` where session-dependent), or Route Handlers (Node.js runtime, since the `openai` SDK and Supabase server client need Node APIs — not Edge).
- Environment variables are configured in the Vercel dashboard per environment (Production/Preview/Development); `.env.example` documents every key. No secret is committed.
- No filesystem writes at runtime. No in-memory caches relied on for correctness (a cache used purely as a perf optimization must be safe to lose on every request).

## 4. Supabase architecture

- **Auth**: Supabase Auth (email/password for MVP simplicity — no extra OAuth app registration required to ship). `profiles` row is created for each new `auth.users` row via a Postgres trigger, defaulting `role = 'user'`.
- **Database**: Postgres with RLS enabled on every table that holds user-owned or sensitive data. Coach/admin tables (`communication_tools`, `scenarios`) are readable by any authenticated user (active rows only) and writable only by `role = 'coach'` profiles.
- **Migrations**: plain SQL files under `supabase/migrations`, applied with the Supabase CLI (`supabase db push`). No ORM — typed query helpers in `src/lib/db` wrap `@supabase/supabase-js` calls with hand-written TypeScript types matching the schema (`src/lib/db/types.ts`).
- **Service role key**: used only in `src/lib/supabase/admin.ts`, only from server-only code paths (seeding scripts, and — narrowly — admin routes that need to manage `profiles.role`, which a coach shouldn't be able to escalate via a normal RLS-governed update). Every other server operation uses the request-scoped client bound to the signed-in user's JWT so RLS applies.

### 4.1 Database model

- `profiles` — 1:1 with `auth.users`. `role`: `'user' | 'coach'`.
- `communication_tools` — the coach's methodology library. Structured columns for the fields that are always present (name, slug, descriptions, weights); JSONB for genuinely variable-length lists (principles, examples, mistakes) where an extra join table would add ceremony without value at this scale.
- `scenarios` — belongs to a tool. Structured columns + JSONB lists for behaviours/escalation/de-escalation/constraints (same rationale).
- `practice_sessions` — one row per attempt. Tracks `mode`, `selected_duration_seconds`, `status`, `attempt_number` (computed server-side per user+scenario), `hint_count`, `readiness_rating`.
- `conversation_messages` — one row per turn (`speaker`: `user | interlocutor | coach_hint`), ordered by `sequence`. Chosen over a single transcript blob so turns can be queried, counted, and fed to prompts incrementally without re-parsing text.
- `evaluations` — one row per session (1:1). Six scalar scores for simple querying/comparison + `structured_evidence` JSONB holding the evidence/explanation pairs per dimension (matches the AI's structured output shape 1:1, avoids 18 extra columns for something that's always read as a unit).
- `realtime_turn_events` — one row per user turn, AI turn, overlap interval, or confirmed barge-in captured during a Realtime session (kind-discriminated via `kind`). Structured numeric/boolean/enum columns for every known field; a small `metadata` JSONB only for genuinely unstructured extras. Never contains raw audio — timestamps (ms relative to session start), durations, and transcript text (already stored in `conversation_messages`) only. See §9.3 and `docs/DECISIONS.md` "Realtime timing metrics."
- `realtime_session_metrics` — one row per session (1:1, upserted at finalization), the derived aggregate timing/interruption metrics (speaking time/percentage, overlap, confirmed-interruption count, response latency). A measurement layer only — not yet read by the Evaluation Engine or shown in production UI.

Full column lists are in the migration files (`supabase/migrations`) — they are the source of truth; this document describes intent, not a mirror of the DDL.

### 4.2 Row Level Security summary

- `profiles`: user selects/updates own row only. No self-service role escalation (role changes go through a server action gated on the *current* profile already being `coach`).
- `communication_tools`, `scenarios`: `SELECT` where `active = true` for any authenticated user; coaches can additionally see inactive rows and `INSERT`/`UPDATE`/`DELETE`.
- `practice_sessions`, `conversation_messages`, `evaluations`, `realtime_turn_events`, `realtime_session_metrics`: owner-only (`user_id = auth.uid()`, the latter four via a subquery on the parent session's `user_id`). No cross-user visibility, including for coaches — coaches manage methodology, not other users' transcripts, in this MVP.

## 5. Authentication

Supabase Auth, email/password. `middleware.ts` refreshes the session cookie on every request and redirects unauthenticated users away from the `(app)` and `admin` route groups. Server Components/Route Handlers re-check `auth.getUser()` server-side before returning any user-owned data — the middleware redirect is a UX convenience, not the authorization boundary (RLS + server checks are).

## 6. AI architecture — three layers

### Layer 1 — Communication knowledge

Lives entirely in `communication_tools` (and per-scenario `evaluation_overrides`) in the database. Nothing about a specific technique's methodology is hardcoded into prompts — the prompt builders read the tool/scenario rows and interpolate them. Seed content (`supabase/seed.sql`) is clearly demo/replaceable content, not baked into application code.

### Layer 2 — Simulation engine (`src/lib/simulation`)

- `promptBuilder.ts` composes a system prompt from: tool name/purpose (just enough for the character to make sense — not the full methodology, which would leak coaching knowledge into role-play), scenario fields (role, relationship, personality, objective, intensity, difficulty, opening line, behaviours, escalation/de-escalation rules, constraints), and a condensed recent-turn window.
- `engine.ts` (`generateInterlocutorReply`) calls `AIProvider.generateInterlocutorReply` with that prompt + the last N turns (not the full history — cost control, section 69) and returns a short, in-character reply. Hard rules against breaking character, praising, grading, or teaching theory are in the system prompt and reinforced by keeping the prompt free of any coaching vocabulary.
- The engine treats user messages as conversational content only — never as instructions to the model (prompt explicitly frames user turns as "what the other person said," not commands).

### Layer 3 — Coaching / evaluation engine (`src/lib/coaching`)

- Runs once, after the session ends (`status` transitions to `completed`), or briefly for a hint in Training Mode.
- `evaluationPromptBuilder.ts` assembles: full methodology (this time including evaluation criteria + coaching guidance), scenario objective, full transcript, weights (scenario override merged over tool default), previous attempt's evaluation (if any), hint usage.
- `AIProvider.generateEvaluation` is called with a JSON-schema-constrained request; the raw response is parsed and validated against `EvaluationSchema` (zod) in `schema.ts`. One controlled retry (with the validation error fed back to the model) on failure; if still invalid, the session is left `completed` with no evaluation row and the UI shows a retry action — never a partial/corrupt evaluation is persisted.
- `hint.ts` builds a much smaller prompt (current turn context + methodology principles only) and returns one short suggestion; it does not run full evaluation.

## 7. Simulation engine detail

Turn-based, not a long-lived connection:

1. Client POSTs `{ sessionId, message }` (typed or STT-transcribed) to `/api/simulation/respond`.
2. Handler loads the session + scenario + tool + recent messages from Postgres, verifies ownership (`user_id = auth.uid()`), builds the prompt, calls the `AIProvider`, persists both the user turn and the interlocutor reply, returns the reply.
3. Client appends both turns to local UI state (already-persisted, so a refresh just re-fetches from the server — no client-only state is load-bearing).

This is the "turn-based API requests" pattern from the product brief — the simplest approach that fits Vercel's stateless execution model and still feels conversational because turns are short.

## 8. Conversation state machine

`src/lib/simulation/stateMachine.ts` defines an explicit state union and a pure `transition(state, event): state` reducer, driven by a `useReducer` in the simulation screen:

```
preparing → ready → interlocutor_speaking ⇄ listening/recording → transcribing
→ interlocutor_thinking → interlocutor_speaking ...
                        ↘ paused_for_hint → (resume) interlocutor_speaking/listening
→ ending → evaluating → complete
any state → error (with a defined recovery transition back to a safe state)
```

Illegal transitions (e.g. `recording` while `interlocutor_speaking`) are simply not defined in the transition table and are no-ops, guaranteeing the UI can never show two conflicting activities at once. Unit-tested in `tests/unit/stateMachine.test.ts`.

## 9. Voice architecture

Two parallel implementations exist, selected per-session by `REALTIME_VOICE_ENABLED` (see /docs/DECISIONS.md "Realtime voice rollout"). The batch path is the original MVP implementation and the deliberate fallback/rollback target; Realtime is the target experience once verified.

### 9.1 Batch (STT → LLM → TTS), the fallback path

- `SpeechToTextProvider.transcribe(audio)`, `TextToSpeechProvider.synthesize(text)` interfaces in `src/lib/voice`. OpenAI implementations (Whisper transcription, OpenAI TTS) behind Route Handlers (`/api/voice/stt`, `/api/voice/tts`); a `MockProvider` pair is used automatically when `OPENAI_API_KEY` is absent, and the UI shows a clear "voice unavailable, using text mode" state rather than pretending mock audio is real.
- Client records with `MediaRecorder` (push-to-talk button), uploads the blob to `/api/voice/stt`, gets a transcript back, and feeds it into the same `/api/simulation/respond` flow as typed input — voice and text share one code path after transcription. The interlocutor's reply text is sent to `/api/voice/tts` and played via an `<audio>` element.
- This is deliberately turn-based HTTP, not a realtime/streaming connection — no server process needs to stay alive for the duration of the call, which fits Vercel.
- Microphone permission denial, transcription failure, and TTS failure all map to explicit state-machine `error` transitions with a recovery path (retry or fall back to typed input) — never a silent hang. Failures are categorized (`src/lib/voice/errorClassification.ts`) so only a genuinely unconfigured provider disables voice for the rest of a session — every other failure (rate limit, quota, network, etc.) stays retryable.

### 9.2 Realtime (WebRTC speech-to-speech), the target path

- `src/lib/realtime/session.ts` (server-only) mints a short-lived OpenAI Realtime client secret via `POST /api/simulation/realtime/session`, with the full session config — model, the *same* `buildInterlocutorSystemPrompt()` instructions used by the batch engine, voice, and `server_vad` turn detection — baked in server-side. `OPENAI_API_KEY` never reaches the browser.
- `src/lib/realtime/webrtcClient.ts` (browser-only) opens the mic, negotiates a `RTCPeerConnection` directly against OpenAI (`https://api.openai.com/v1/realtime/calls`) using that ephemeral secret, and exposes a data channel for session/transcript events. Audio flows peer-to-peer between the browser and OpenAI — it never transits our server.
- `src/components/practice/realtime-simulation-client.tsx` drives a dedicated, simpler state machine (`src/lib/realtime/connectionState.ts`: `connecting → listening ⇄ user_speaking → thinking → speaking → …`, distinct from the batch flow's `stateMachine.ts` — continuous listening has no "recording"/"transcribing" steps) and renders a calm state indicator (Listening/Thinking/Speaking + connection status) rather than a chat transcript, per the product requirement that voice practice should feel like a conversation, not a message log.
- Transcript persistence is the one place the server is still involved mid-conversation: as the data channel emits `conversation.item.input_audio_transcription.completed` (user) and `response.output_audio_transcript.done` (AI) events, the client POSTs each completed turn to `/api/simulation/realtime/transcript`, which calls the same `appendMessage()` used by the batch flow — so `conversation_messages` looks identical regardless of transport, and the post-session Evaluation Engine (`src/lib/coaching/*`, invoked via `/api/practice/end`) needs no changes at all.
- Timer and End Practice are identical in behavior to the batch screen (same `computeRemainingSeconds` utility, same `/api/practice/end` call on timeout or manual end) — only the transport and the mid-conversation UI differ.
- Typed input remains available as a secondary fallback *within* an active Realtime session (sent as a `conversation.item.create` + `response.create` pair over the data channel, and persisted the same way as spoken turns) — separate from the deployment-level rollback to the batch component entirely.

### 9.3 Timing + interruption metrics (measurement layer)

- `src/lib/realtime/sessionTimeline.ts` (pure, injectable-clock module) listens to the same Realtime data-channel events as §9.2's transcript persistence, plus `input_audio_buffer.speech_started`/`.speech_stopped`, `output_audio_buffer.started`/`.stopped`, `response.created`/`response.done`, and the existing barge-in controller's confirmed-interruption callback — never raw single VAD events. It derives per-turn timing (preferring server-authoritative `audio_start_ms`/`audio_end_ms` for user turns) and, at session end, session-level aggregates (speaking time/percentage, overlap, confirmed-interruption count, user/system response latency).
- `metricsRef` in `realtime-simulation-client.tsx` is created once per practice session (spanning any WebRTC reconnect, unlike the per-connection barge-in controller) and finalized in `finishAndEvaluate`, which best-effort `POST`s the snapshot to `/api/simulation/realtime/metrics` and logs a human-readable debug view via `console.debug` — a dev/QA aid only, no production UI. A metrics failure is caught, logged, and never blocks the transcript flush or `/api/practice/end`.
- Persisted via `src/lib/db/realtimeMetrics.ts` into `realtime_turn_events`/`realtime_session_metrics` (see §4.1) — a delete-then-reinsert for turn events and an upsert-by-`session_id` for the aggregate row, so a retried finalization can never double-count. No raw audio is ever stored; see `docs/DECISIONS.md` "Realtime timing metrics" for the full event-source audit.
- Not yet used by the Evaluation Engine or surfaced to users — `VOCAL_EVIDENCE_AVAILABLE` (§ coaching) is unaffected and stays `false`.

## 10. State management

- Server state (sessions, messages, evaluations, tool/scenario library) is the source of truth in Postgres; the client never treats its own memory as authoritative — every mutation is a request that persists first, then updates local UI state from the response.
- Local component state (`useReducer` for the state machine, `useState` for form/timer UI) is intentionally ephemeral and disposable — losing it (e.g. on refresh) means re-fetching from the server, not losing data.

## 11. Provider abstractions

```ts
interface AIProvider {
  generateInterlocutorReply(input): Promise<{ text: string }>;
  generateHint(input): Promise<{ text: string }>;
  generateEvaluation(input): Promise<unknown>; // validated by caller with zod
}

interface SpeechToTextProvider {
  transcribe(audio: Blob | Buffer, mimeType: string): Promise<{ text: string }>;
}

interface TextToSpeechProvider {
  synthesize(text: string): Promise<{ audioBase64: string; mimeType: string }>;
}
```

`src/lib/ai/index.ts` and `src/lib/voice/index.ts` are the only places that decide which concrete implementation to construct (based on env vars). Everything else imports the interface type and calls a factory function — swapping providers is a one-file change.

## 12. Cost control

- Interlocutor prompts send only the tool/scenario summary + the last ~8 turns, not the full growing transcript.
- Evaluation runs exactly once per completed session (not per turn).
- Hints use a minimal prompt (no full methodology dump, no full transcript — just recent turns + principles).
- Interlocutor replies are instructed to stay short (natural spoken-length turns), which also bounds output token cost.
