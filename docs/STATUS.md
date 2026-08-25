# Status — Virtual Communication Coach

Last updated: Realtime voice Phase 1 + 2 session.

## Current phase

All six original MVP build phases plus Realtime voice Phase 1 + 2 (see `docs/BUILD_PLAN.md`) are implemented. The app is feature-complete for the MVP scope plus a working speech-to-speech conversation path, and passes lint, typecheck, unit tests, and a production build. A Supabase project and an OpenAI API key have since been connected in production (Vercel) — see "Known limitations" for what's still unverified there specifically.

## Realtime voice (Phase 1 + 2) — just added

- Full architecture in `docs/DECISIONS.md` ("Realtime voice rollout") and `docs/ARCHITECTURE.md` §9.2.
- **Off by default** — set `REALTIME_VOICE_ENABLED=true` in Vercel (alongside the already-configured `OPENAI_API_KEY`) to turn it on. Until then, every session uses the existing batch STT/TTS path unchanged.
- Not yet exercised against a live OpenAI Realtime session in this build environment (no browser with microphone access here) — the one part of the implementation genuinely unverified end-to-end is the WebRTC SDP exchange against `https://api.openai.com/v1/realtime/calls`, which was inferred from the installed SDK's types/doc comments rather than observed working. First real test should specifically watch for this.
- **Graceful session completion**, added just after Phase 1 + 2: ending (timer or End Practice) waits for the user's last utterance to finish transcribing and flushes queued transcript writes before `/api/practice/end` runs — see `docs/DECISIONS.md` for the two races this closes.
- **Evaluation Engine safety guardrail**, added at the same time: the coach prompt now explicitly forbids claiming to have observed tone, pace, pauses, confidence, or any other paralinguistic/vocal signal, since only a text transcript is ever provided. No scoring, schema, or feedback-format changes — the full rubric/methodology redesign is still future work (Communication Manual / content architecture, not started).
- **Two production-confirmed fixes**, added after live testing surfaced them: (1) the practice screen could get stuck showing "Wrapping up…" indefinitely even after evaluation had already succeeded server-side, because `"complete"` had no distinct UI state and `router.push()` cannot report a stalled navigation — fixed with a distinct "Feedback ready" label plus a bounded watchdog that offers a "View feedback" recovery button (hard navigation, doesn't re-run evaluation); (2) the AI's voice was being cut off mid-word when the timer hit 0:00, because timer expiry used the same immediate-cancel path as manual End Practice — fixed so timer expiry now waits for the current exchange to finish naturally before ending (manual End Practice is unchanged). Every finalization stage is now logged client-side for future diagnosis. See `docs/DECISIONS.md` "Production fixes" for the full detail.
- Known, deliberate gaps for this phase: Training Mode hints aren't wired into the Realtime screen; no vocal/prosody analytics; no raw audio persistence.

## Completed

- **Phase 1 — Foundation**: Next.js 15 + TypeScript (strict) + Tailwind v4 project; Supabase client wrappers (browser/server/admin) and auth-refresh middleware; full SQL schema (`profiles`, `communication_tools`, `scenarios`, `practice_sessions`, `conversation_messages`, `evaluations`) with RLS policies on every table; email/password auth (signup/login/logout); responsive app shell (top bar + bottom nav, safe-area aware); communication tool library + scenario browsing; seed data (5 tools × 2 scenarios, `supabase/seed.sql`); coach/admin CRUD for tools and scenarios.
- **Phase 2 — Text practice loop**: practice setup screen; `AIProvider` interface with OpenAI + deterministic Mock implementations; simulation prompt builder/engine (Realistic Mode, character stays in-character, never coaches); explicit conversation state machine; 2/3/5-minute timer (default 3); turn-based `/api/simulation/respond`; End Practice (manual + timer-triggered); coaching/evaluation engine with a zod-validated structured-output schema and one controlled retry on validation failure; six practice indicators with evidence; feedback UI (overall result, what worked, what could improve, next focus); Try Again with correct attempt numbering; attempt comparison against the previous completed attempt.
- **Phase 3 — Voice**: `SpeechToTextProvider` / `TextToSpeechProvider` interfaces with OpenAI (Whisper + TTS) and Mock implementations; `/api/voice/stt` and `/api/voice/tts` route handlers; `MediaRecorder`-based mic capture with permission-denial handling; TTS playback of every interlocutor line (opening line included) when available; typed input always available as a fallback, and the default when voice is unavailable.
- **Phase 4 — Training Mode**: Realistic/Training selector on the setup screen; "Need a hint?" control (Training Mode only) that pauses the simulation, calls the coach layer for one short suggestion, and resumes with state preserved; `hint_count` tracked per session and factored into the evaluation prompt.
- **Phase 5 — History & repeat practice**: session history list; reopening a session shows the transcript, scores, feedback, and comparison (or a "not completed" state with a resume/delete option); delete-own-session; "Practice this again" from both history and the feedback screen; self-reported readiness (1–5) captured after feedback, stored independently of AI scoring.
- **Phase 6 — Mobile/PWA polish**: mobile-first layout throughout (44px+ touch targets, safe-area insets, no forced viewport zoom lock); loading/empty/error states audited (`src/components/ui/state.tsx`, segment-level `loading.tsx`/`error.tsx`, a root `global-error.tsx`); basic PWA manifest + SVG icon; production build verified.
- **Testing**: 56 Vitest unit tests across timer math, the full state-machine transition table, weighted scoring, attempt numbering/previous-attempt selection, score-delta comparison, AI-output schema validation, admin form parsing, and an authorization test exercising `requireOwnedSession` (401 unauthenticated, 404 cross-user, 404 missing, success for the owner) against a stubbed Supabase client. One Playwright e2e test covering the full happy path (signup → choose skill → choose scenario → practise → end → feedback → try again) with the AI provider mocked.
- Docs (`CLAUDE.md`, `docs/ARCHITECTURE.md`, `docs/BUILD_PLAN.md`, `docs/DECISIONS.md`, this file), `README.md`, `.env.example`.

## Known limitations

- **No live Supabase project was connected during this build session.** The schema, RLS policies, and seed data exist as SQL and have been reviewed carefully, but have not been applied to or exercised against a real Postgres instance from here. `npm run build` passes using placeholder env values that satisfy validation but point at no real backend. A production (`next start`) smoke test against those placeholder values did confirm: the app boots, unauthenticated requests to protected routes (`/home`, `/admin`) correctly redirect to `/login` via middleware, and the login/signup pages, manifest, and icon all render — i.e. everything that doesn't require a working Supabase connection behind it. That smoke test is also what caught and fixed a real route-collision bug (see `docs/DECISIONS.md` "Practice setup route moved").
- **No OpenAI (or other) API key was supplied.** The app runs entirely on its deterministic Mock `AIProvider`/`SpeechToTextProvider`/`TextToSpeechProvider` by default (see `docs/DECISIONS.md`). Real conversation quality, transcription accuracy, and speech synthesis have not been evaluated against the live API — only that the request/response plumbing and structured-output validation path are correct against a hand-authored JSON Schema.
- **The Playwright e2e test has not been run in this session** for the same reason (no live Supabase project to sign up against). It's written and wired into `npm run test:e2e`, targeting the pre-installed Chromium in this environment; it needs a real (or local `supabase start`) test project with migrations + seed applied to actually execute.
- **Supabase package versions are pinned below `latest`** (`@supabase/supabase-js@2.45.x`, `@supabase/ssr@0.5.x`) due to a type-inference issue in the newest release — see `docs/DECISIONS.md`.
- Coach → `role = 'coach'` promotion is a direct SQL step (documented in the README), not an in-app flow, to avoid building self-service privilege escalation for an MVP with presumably one or a handful of coaches.

## External credentials still required (from the user)

1. A Supabase project (URL + anon key + service role key), with `supabase/migrations` applied and `supabase/seed.sql` run.
2. An OpenAI API key, to move off the mock AI/voice providers — or a decision to integrate a different provider (one new file per `AIProvider`/`SpeechToTextProvider`/`TextToSpeechProvider` implementation, per the existing abstraction).
3. A Vercel project linked to the GitHub repo with the above as environment variables, for production deployment.

## Next tasks (post-MVP, not started — see BUILD_PLAN.md "Out of scope")

- Apply migrations + seed to a real Supabase project and smoke-test the full flow live (signup → practice → real AI feedback → history).
- Run `npm run test:e2e` against that project to confirm the Playwright happy path passes for real.
- Once real usage exists: revisit whether the six starter tools/scenarios need expansion, and whether `OPENAI_CHAT_MODEL` should move off the conservative default.
