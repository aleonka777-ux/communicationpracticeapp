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

Full column lists are in the migration files (`supabase/migrations`) — they are the source of truth; this document describes intent, not a mirror of the DDL.

### 4.2 Row Level Security summary

- `profiles`: user selects/updates own row only. No self-service role escalation (role changes go through a server action gated on the *current* profile already being `coach`).
- `communication_tools`, `scenarios`: `SELECT` where `active = true` for any authenticated user; coaches can additionally see inactive rows and `INSERT`/`UPDATE`/`DELETE`.
- `practice_sessions`, `conversation_messages`, `evaluations`: owner-only (`user_id = auth.uid()`, messages/evaluations via a subquery on the parent session's `user_id`). No cross-user visibility, including for coaches — coaches manage methodology, not other users' transcripts, in this MVP.

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

- `SpeechToTextProvider.transcribe(audio)`, `TextToSpeechProvider.synthesize(text)` interfaces in `src/lib/voice`. OpenAI implementations (Whisper transcription, OpenAI TTS) behind Route Handlers (`/api/voice/stt`, `/api/voice/tts`); a `MockProvider` pair is used automatically when `OPENAI_API_KEY` is absent, and the UI shows a clear "voice unavailable, using text mode" state rather than pretending mock audio is real.
- Client records with `MediaRecorder` (push-to-talk button), uploads the blob to `/api/voice/stt`, gets a transcript back, and feeds it into the same `/api/simulation/respond` flow as typed input — voice and text share one code path after transcription. The interlocutor's reply text is sent to `/api/voice/tts` and played via an `<audio>` element.
- This is deliberately turn-based HTTP, not a realtime/streaming connection — no server process needs to stay alive for the duration of the call, which fits Vercel. A `RealtimeVoiceProvider` interface slot is documented (not implemented) for a future upgrade (e.g. OpenAI Realtime API over WebRTC with short-lived client secrets minted server-side) without needing to redesign the rest of the app.
- Microphone permission denial, transcription failure, and TTS failure all map to explicit state-machine `error` transitions with a recovery path (retry or fall back to typed input) — never a silent hang.

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
