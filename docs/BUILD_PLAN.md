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
- [x] Production fix — the "stuck on Wrapping up…" hang: `"complete"` now has its own status label and can't fall back to live mic/text controls, and a bounded watchdog shows a "View feedback" recovery button (hard navigation) if `router.push` stalls after a successful evaluation; every finalization stage is now logged client-side
- [x] Production fix — timer expiry no longer cancels an in-progress AI turn; it waits for the current exchange (user's utterance + any resulting AI response) to finish naturally before ending, so the AI is never cut off mid-word at 0:00. Manual End Practice is unchanged (immediate stop).
- [x] Evidence-integrity fix — seeded rubric text (`supabase/seed.sql` + migration `0008`) no longer instructs the Evaluation Engine to judge "calm," "tone," or "volume"; every tool's Non-escalation criterion is now explicitly transcript/wording-based; the coach prompt's guardrail now overrides any future rubric text phrased that way too
- [x] Evidence-integrity fix, round 2 — added a code-level check (`src/lib/coaching/evidenceIntegrity.ts`, `VOCAL_EVIDENCE_AVAILABLE` capability flag) that regenerates any evaluation making a paralinguistic claim (tone, voice, calm, volume, pace, pauses, hesitation, vocal, emotional state — praise or criticism alike), since the prompt-level guardrail alone proved unreliable in production twice
- [x] Evidence-integrity fix, round 3 — recovery strategy changed from rejecting the whole evaluation (502, total feedback loss) to sanitizing only the still-violating field(s) after one regenerate attempt: a meaning-preserving phrase rewrite where a safe one exists, otherwise a short neutral transcript-grounded statement for that field alone — every other field, and the schema/rubric/scoring/layout, are untouched
- [x] Acoustic-echo false-interruption fix — explicit mic constraints (echoCancellation/noiseSuppression/autoGainControl) with applied-settings diagnostics; VAD threshold raised 0.5→0.6; `interrupt_response` disabled server-side in favor of a client-controlled barge-in confirmation (`src/lib/realtime/bargeIn.ts`, 250ms window) so a single echo/click/breath VAD blip can no longer cancel the AI, while sustained genuine speech still interrupts promptly; structured debug logging added to distinguish the two cases (`src/lib/realtime/debugLog.ts`)
- [x] Startup-specific false-interruption fix — closed a state race where the AI could start producing audio fractionally before the barge-in controller knew it (now also triggered by `response.created`, the event OpenAI guarantees precedes any audio, with `response.done` as the matching backstop so the flag can't get stuck); added a widened (500ms vs. the normal 250ms) confirmation window scoped ONLY to the AI's first turn, since that's also where the browser's echo-cancellation filter is least converged. VAD threshold unchanged (still 0.6), no muting, no delay added to the rest of the conversation.
- [x] Startup false-interruption fix, round 2 — a flat 500ms first-turn window still wasn't enough per a reproduced production timeline; replaced with `src/lib/realtime/startupGuard.ts`'s `computeStartupConfirmMs`, a continuous grace-period formula anchored to when AI audio actually starts playing (1000ms grace + 500ms follow-up right at playback start, shrinking smoothly to just the follow-up window as real time passes, reverting completely to 250ms after the first turn). VAD threshold still unchanged (0.6), no muting.
- [x] Realtime timing + interruption metrics — objective measurement layer only, no scoring/UI change: `src/lib/realtime/sessionTimeline.ts` derives per-turn and session-level timing/overlap/response-latency metrics from Realtime SDK events (server-authoritative `audio_start_ms`/`audio_end_ms` for user turns, client-clock `output_audio_buffer.*` for AI turns); confirmed barge-in (not raw VAD) is the only interruption signal; overlap tracked separately; new additive migration `0009_realtime_timing_metrics.sql` + `/api/simulation/realtime/metrics` persisted best-effort from `finishAndEvaluate` (a metrics failure never blocks transcript/evaluation); no raw audio stored; `VOCAL_EVIDENCE_AVAILABLE` unchanged (`false`); dev-only debug output via `console.debug`, no production UI. See `docs/DECISIONS.md` "Realtime timing metrics."
- [x] Realtime timing metrics, measurement-integrity fix — a raw `speech_started`/`speech_stopped` pair (including known false echo blips) is no longer counted as a real user turn by itself: every user speech event is now classified `confirmed`/`suspected_noise` using confirmed-barge-in state, transcript presence/emptiness, explicit transcription failure, and duration only as a last resort; suspected-noise events are excluded from turn count, speaking time, both response-latency metrics, and overlap, while still being retained in the raw event list for diagnostics. See `docs/DECISIONS.md`.
- [x] Realtime timing metrics, numeric type fix — production `22P02` errors (`invalid input syntax for type integer: "16258.5"`) from `/api/simulation/realtime/metrics` left both timing tables permanently empty, because several `integer` columns actually receive fractional `performance.now()`-derived values; fixed with additive migration `0010_fix_realtime_metric_numeric_types.sql` (`double precision` for every ms/duration/latency field, counters left as `integer`). Validation + DB-row mapping extracted to `src/lib/realtime/metricsPayload.ts` for direct unit testing. See `docs/DECISIONS.md`.
- [ ] Not yet: Training Mode hints wired into the Realtime screen
- [ ] Not yet: vocal/prosody analytics (pace, pauses, latency, intensity) — see the voice audit in chat history for the full breakdown of what's possible without further architecture changes
- [ ] Not yet: raw audio persistence
- [ ] Not yet: using the new timing/interruption metrics in Evaluation Engine scoring or any production-facing UI
- [ ] Not yet: verified against a live OpenAI account in production (see /docs/STATUS.md)

## Testing

- [x] Vitest: timer, state machine transitions, scoring/weight math, attempt numbering, previous-attempt selection, comparison logic, evaluation schema validation, RLS/authorization-relevant query helpers, voice error classification, Realtime connection-state transitions, Realtime graceful-completion wait helpers (pending-transcription and current-exchange), finalization logging, Evaluation Engine paralinguistic-safety guardrail + evidence-integrity regression (real corrected rubric fixtures, defense-in-depth override, the exact production "respectful tone" sentences, and a mocked-provider test of the reject/regenerate flow), barge-in confirmation controller (blip vs. sustained speech vs. AI-finishes-mid-confirmation vs. reset), mic-constraint graceful degradation, the VAD/interrupt session configuration itself, and evidence-integrity sanitization (meaning-preserving rewrites, neutral fallback, and the exact production case of "tone" surviving both generation and retry), and the barge-in controller's startup-specific dynamic confirmation window (resolved fresh per speech event, widened only for the first AI turn, reverting after, immune to accumulation across repeated blips); the startup grace-period formula itself (`computeStartupConfirmMs`) and its integration with the barge-in controller (startup echo past the old 500ms window still doesn't interrupt, genuine sustained speech still does, later turns unaffected); the timing/interruption measurement layer (`sessionTimeline.ts`): normal AI→user→AI exchange and turn indexing, server-VAD-preferred vs. client-fallback user turn duration, user response latency excluding overlapping/interrupting turns, AI/system response latency, confirmed barge-in marking the interrupted AI turn without double-counting its duration, false VAD blips never counted as an interruption, overlap duration as a distinct signal from confirmed interruption, turns left open by graceful timer completion vs. manual End Practice (`endedBySessionClose` vs. `wasInterrupted`), duplicate-event idempotency, duplicate-`finalize()` idempotency, and a snapshot-wide assertion that no raw-audio-shaped field is ever present; user-speech-event classification (a speaker-echo blip with no transcription excluded from all session metrics, a genuine short "Yes." reply included, a confirmed barge-in included regardless of transcript/duration, explicit transcription failure and completed-empty transcription both excluded, and noise exclusion from overlap/turn-count/speaking-time); the timing-metrics payload schema and DB-row mapping (`src/lib/realtime/metricsPayload.ts`): fractional user/AI turn timing, overlap duration, response latency, and averages/medians all accepted and preserved without rounding (including the exact production value `16258.5`), while integer counters and turn indices are still rejected if fractional
- [x] Playwright: login → choose skill → choose scenario → start practice → exchange messages → end practice → evaluate → view feedback → try again (mocked AI provider, no live API calls; covers the batch path — Realtime requires a live OpenAI account and browser WebRTC support, so it isn't exercised by this automated suite)

## Out of scope for this MVP (do not build without an explicit request)

Realistic video avatar, native iOS/Android apps, gamification/badges/streaks/leaderboards, multiplayer/social feed, full communication course content, hundreds of scenarios, custom model training/fine-tuning, facial-expression or vocal-emotion analysis, psychological profiling, automatic adaptive difficulty, complex personalized recommendations, extensive analytics dashboards, payments/subscriptions, push notifications, user-created scenarios, realtime full-duplex voice (interruptions/streaming).
