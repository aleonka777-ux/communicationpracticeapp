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

## Testing

- [x] Vitest: timer, state machine transitions, scoring/weight math, attempt numbering, previous-attempt selection, comparison logic, evaluation schema validation, RLS/authorization-relevant query helpers
- [x] Playwright: login → choose skill → choose scenario → start practice → exchange messages → end practice → evaluate → view feedback → try again (mocked AI provider, no live API calls)

## Out of scope for this MVP (do not build without an explicit request)

Realistic video avatar, native iOS/Android apps, gamification/badges/streaks/leaderboards, multiplayer/social feed, full communication course content, hundreds of scenarios, custom model training/fine-tuning, facial-expression or vocal-emotion analysis, psychological profiling, automatic adaptive difficulty, complex personalized recommendations, extensive analytics dashboards, payments/subscriptions, push notifications, user-created scenarios, realtime full-duplex voice (interruptions/streaming).
