# Build Plan — Virtual Communication Coach

Phased implementation plan. Check items off as completed; see `/docs/STATUS.md` for the current live status (this file is the plan, STATUS.md is the truth about what's actually done).

## Phase 1 — Foundation

- [x] Next.js 15 + TypeScript + Tailwind v4 project scaffold
- [x] ESLint + strict tsconfig
- [x] Supabase project wiring (browser/server/admin clients)
- [x] Database migrations: profiles, communication_tools, scenarios, practice_sessions, conversation_messages, evaluations
- [x] Row Level Security policies for all tables
- [x] Supabase Auth: sign up, log in, log out, session refresh middleware
- [x] Profile auto-creation trigger + role handling
- [x] Responsive application shell (mobile-first nav)
- [x] Communication tool library page + scenario list per tool
- [x] Seed data: 5 tools × 2 scenarios
- [x] Coach/admin CRUD for tools and scenarios
- [x] Vercel-compatible config, `.env.example`

## Phase 2 — Text practice loop (core)

- [x] Practice setup screen (scenario, role, objective, character, technique reminder, mode, duration)
- [x] `AIProvider` interface + OpenAI implementation + Mock implementation
- [x] Simulation prompt builder + engine (Realistic Mode)
- [x] Conversation state machine
- [x] Timer (2/3/5 min, default 3) with graceful end-of-time handling
- [x] Turn-based `/api/simulation/respond` route, persisted transcript
- [x] End Practice (manual + timer-triggered)
- [x] Evaluation engine: prompt builder + zod schema + validated structured output + controlled retry
- [x] Six practice indicators with evidence
- [x] Feedback UI: overall result, what worked, what could improve, next focus
- [x] Try Again (new attempt, correct attempt numbering)
- [x] Attempt comparison vs previous attempt

## Phase 3 — Voice

- [x] `SpeechToTextProvider` / `TextToSpeechProvider` interfaces + OpenAI implementations + Mock implementations
- [x] `/api/voice/stt`, `/api/voice/tts` route handlers
- [x] Microphone capture (MediaRecorder), permission handling, error/retry states
- [x] AI reply playback via TTS
- [x] Typed fallback preserved and always available

## Phase 4 — Training Mode

- [x] Realistic / Training mode selector on setup screen
- [x] "Need a hint?" control (Training Mode only)
- [x] Hint pauses simulation, calls coach layer briefly, resumes with state preserved
- [x] `hint_count` tracked and passed into evaluation context

## Phase 5 — History & repeat practice

- [x] Session history list (date, tool, scenario, mode, duration, attempt #)
- [x] Reopen a session (transcript, scores, feedback, comparison)
- [x] Delete an individual session
- [x] "Practice This Again" from history and from feedback screen
- [x] Self-reported readiness (1–5) captured after feedback, stored independently of AI scores

## Phase 6 — Mobile / PWA polish & deployment

- [x] Mobile layout pass: touch targets, safe areas, typography
- [x] Loading / empty / error / retry states audited across major screens
- [x] Basic PWA manifest + icons (no offline requirement)
- [x] Accessibility pass (labels, contrast, focus states, aria-live for transcript)
- [x] Production build verified
- [x] Vercel deployment checklist verified

## Phase 7 — Realtime voice (speech-to-speech), behind a rollback switch

See /docs/DECISIONS.md "Realtime voice rollout" for the full architecture. Batch voice (Phase 3) is kept fully intact as the fallback/rollback path — `REALTIME_VOICE_ENABLED` defaults off.

- [x] Phase 1 — Server-side ephemeral Realtime client secret endpoint (`/api/simulation/realtime/session`), reusing the existing Simulation Prompt Builder verbatim; `OPENAI_API_KEY` never reaches the browser
- [x] Phase 1 — Browser WebRTC connection (mic capture, data channel, SDP exchange) — no SDK helper exists for this, hand-rolled per OpenAI's WebRTC guide
- [x] Phase 2 — `server_vad` turn detection so the user never has to press Stop; AI opening line spoken via a scoped `response.create`
- [x] Phase 2 — Incremental transcript persistence into the existing `conversation_messages` table via `/api/simulation/realtime/transcript`, serialized client-side to avoid a sequence-number race
- [x] Phase 2 — Dedicated, simpler connection-state UI (Listening/Thinking/Speaking + connection status) instead of a chat transcript; secondary typed-input fallback within an active session
- [x] Phase 2 — Timer and End Practice behavior preserved exactly; post-session Evaluation Engine untouched
- [x] Graceful session completion — ending (timer or End Practice) now cancels any in-progress AI turn, waits briefly for the user's final utterance to finish transcribing, and flushes queued transcript writes before evaluation runs, so the last turn is never silently dropped
- [x] Evaluation Engine safety guardrail — the coach prompt now explicitly forbids claiming to have observed tone, pace, pauses, confidence, or any other paralinguistic/vocal signal, since only a text transcript is ever provided (no scoring/schema/feedback-format changes)
- [ ] Not yet: Training Mode hints wired into the Realtime screen
- [ ] Not yet: vocal/prosody analytics (pace, pauses, latency, intensity) — see the voice audit in chat history for the full breakdown of what's possible without further architecture changes
- [ ] Not yet: raw audio persistence
- [ ] Not yet: verified against a live OpenAI account in production (see /docs/STATUS.md)

## Testing

- [x] Vitest: timer, state machine transitions, scoring/weight math, attempt numbering, previous-attempt selection, comparison logic, evaluation schema validation, RLS/authorization-relevant query helpers, voice error classification, Realtime connection-state transitions, Realtime graceful-completion wait helper, Evaluation Engine paralinguistic-safety guardrail
- [x] Playwright: login → choose skill → choose scenario → start practice → exchange messages → end practice → evaluate → view feedback → try again (mocked AI provider, no live API calls; covers the batch path — Realtime requires a live OpenAI account and browser WebRTC support, so it isn't exercised by this automated suite)

## Out of scope for this MVP (do not build without an explicit request)

Realistic video avatar, native iOS/Android apps, gamification/badges/streaks/leaderboards, multiplayer/social feed, full communication course content, hundreds of scenarios, custom model training/fine-tuning, facial-expression or vocal-emotion analysis, psychological profiling, automatic adaptive difficulty, complex personalized recommendations, extensive analytics dashboards, payments/subscriptions, push notifications, user-created scenarios, realtime full-duplex voice (interruptions/streaming).
