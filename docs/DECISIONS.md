# Decisions — Virtual Communication Coach

Significant technical decisions and the reasoning behind them. Newest at the top.

## Voice error handling: classify by category, not by HTTP status alone

Root cause of "the mic works once, then silently disappears": both voice routes collapsed every possible failure — no key configured, invalid key, expired quota, rate limiting, an unsupported model, a network blip, a malformed recording — into one generic `VoiceProviderError` mapped to HTTP 503, and the client treated *any* 503 as "voice was never configured," permanently setting `voiceAvailable = false` for the rest of the session. Worse, a failed TTS call had no user-facing message at all — it silently fell back to text, so the only visible symptom was the mic icon vanishing.

Fixed by giving `VoiceProviderError` a closed `VoiceErrorCode` (`src/lib/voice/types.ts`), classifying real OpenAI SDK errors into it via `src/lib/voice/errorClassification.ts` (status code alone isn't enough — OpenAI reuses HTTP 429 for both true rate limiting and quota/billing exhaustion, distinguished only by the response body's `code`/`type` field), and centralizing user-facing message + HTTP status per code in `src/lib/voice/errorResponse.ts`. Critically, the client (`simulation-client.tsx`) now only disables voice for the rest of the session when the server reports `code: "not_configured"` — every other category (invalid key, quota, rate limit, model, permission, network, unknown) surfaces a clear message via the existing error banner and leaves the mic enabled for the next attempt. Server-side, each OpenAI provider catch block logs the classified category, HTTP status, provider error code, and OpenAI request ID — never the API key, never audio/transcript content — so failures are diagnosable from Vercel logs alone.

## Practice setup route moved to `/practice/setup/[scenarioId]`

Originally the setup screen lived at `/practice/[scenarioId]/setup`, alongside `/practice/[sessionId]` and `/practice/[sessionId]/feedback`. Next.js requires every dynamic segment at the same position in the route tree to share one parameter name, so having both `[scenarioId]` and `[sessionId]` directly under `/practice/` throws `You cannot use different slug names for the same dynamic path` at runtime — `next build` didn't catch it, but `next start` did on the first real request, caught during this build's own smoke test. Moving setup under a static `setup/` segment (`/practice/setup/[scenarioId]`) puts it in a different subtree from `/practice/[sessionId]`, resolving the collision without changing either ID's meaning.

## Supabase packages pinned below `latest` (`@supabase/supabase-js@2.45.x`, `@supabase/ssr@0.5.x`)

`npm install @supabase/supabase-js@latest` initially pulled in a very recent rewrite of `@supabase/postgrest-js`'s generic type system (requiring `Database` to carry `__InternalSupabase`, per-table `Relationships`, and an internal, unexported `GenericSchema` shape). Under that system, a hand-written `Database` type structurally equivalent to the standard Supabase-CLI-generated shape produced `never` types on every `.insert()`/`.update()` call and even on some `.select()` field access, for reasons that didn't resolve to a documented cause after investigation. Rather than keep debugging an internal, seemingly-in-flux type-inference path, `@supabase/supabase-js` and `@supabase/ssr` are pinned to the long-established 2.45.x / 0.5.x line, which uses the classic, extensively documented `{ public: { Tables: { table: { Row, Insert, Update } } } }` shape our `src/lib/db/types.ts` follows and which every current Supabase+Next.js tutorial matches. Revisit this pin (and drop the hand-written types in favor of `supabase gen types typescript`) once a real Supabase project exists and the newer typegen path has stabilized/documented itself.

## Playwright browser: use pre-installed Chromium, don't run `playwright install`

The execution environment has Chromium pre-installed at `/opt/pw-browsers` with `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`. The e2e config uses that path rather than triggering a download. Document this for anyone running e2e tests in a different environment: run `npx playwright install chromium` there first.

## AI provider: OpenAI, behind an `AIProvider` interface

OpenAI was chosen as the default concrete implementation because it has one SDK covering chat/structured-outputs, transcription (Whisper), and TTS, minimizing the number of vendor accounts needed to get the MVP fully working. The application never calls the OpenAI SDK outside `src/lib/ai` and `src/lib/voice` — swapping to Anthropic/Google/ElevenLabs/Deepgram later means writing one new file per provider and changing the factory, not touching simulation/coaching logic. No credentials were supplied during this build, so `OPENAI_API_KEY` is unset by default and the app runs against `MockProvider`s — documented in `.env.example` and `/docs/STATUS.md`.

## No credentials available at build time → automatic Mock fallback, not a hard failure

Per the build brief (section 25), missing provider credentials must not block building the full loop. `src/lib/ai/index.ts` and `src/lib/voice/index.ts` construct a deterministic Mock implementation whenever the relevant API key env var is absent, and the UI surfaces this (a small "running in demo mode" indicator) rather than silently pretending mock output is a live model or real audio. This keeps `npm run build`, the Playwright e2e test, and manual review of the whole flow possible with zero external accounts.

## Voice transport: turn-based HTTP, not realtime streaming

Given Vercel's stateless serverless execution model and the MVP's emphasis on reliability over cutting-edge latency (section 22, section 70), voice uses `MediaRecorder` → `/api/voice/stt` → text → `/api/simulation/respond` → text reply → `/api/voice/tts` → `<audio>` playback, all as discrete request/response calls. No WebSocket/WebRTC server component is built. A `RealtimeVoiceProvider` slot is documented in the architecture doc for a future streaming upgrade (e.g., OpenAI Realtime API with short-lived client secrets minted server-side) without a rewrite.

## Auth: Supabase email/password only, no third-party OAuth

Keeps the MVP shippable without registering OAuth apps with Google/Apple/etc. (each of those is its own account-creation and review process, out of proportion for an MVP). Supabase Auth still gives us session handling, RLS integration (`auth.uid()`), and a clean upgrade path to add OAuth providers later purely as additional sign-in buttons.

## Database: hand-written SQL migrations + hand-written TypeScript types, no ORM

Prisma/Drizzle would add a dependency and a generated-client build step for a schema of six tables. Plain SQL migrations under `supabase/migrations` plus a single hand-maintained `src/lib/db/types.ts` keep the stack simple (principle: avoid unnecessary dependencies) while still giving full type safety at the `src/lib/db/*` query-function boundary, which is the only place raw Supabase calls happen.

## JSONB usage: only for genuinely variable-length/structured lists

Fields like `core_principles`, `character_behaviours`, `escalation_rules`, evaluation `strengths`/`improvements`, and `structured_evidence` are stored as JSONB because they're variable-length structured lists with no query/filter requirement of their own — normalizing them into child tables would add joins and CRUD ceremony with no product benefit at this scale. Everything with a clear scalar shape (scores, names, slugs, weights-as-a-flat-object) is a real column. This follows the brief's instruction not to use JSON as a substitute for schema design, while still using it where it demonstrably helps (tool/scenario authoring flexibility for the coach).

## Evaluation weights: flat JSON object of six numeric weights, tool-level default + optional scenario override

Stored as `evaluation_weights jsonb` on `communication_tools` (`{ clarity, assertiveness, acknowledgment, non_escalation, technique, effectiveness }`, expected to sum to 1.0) with an optional partial override at `scenarios.evaluation_overrides.weights`. The evaluation engine merges scenario-over-tool at read time. Validated with zod before use; if weights don't sum to ~1.0 (tolerance for rounding) they're renormalized rather than erroring, since a coach hand-editing weights in the admin UI shouldn't be able to break scoring for existing content.

## Six evaluation score columns + one JSONB evidence blob, not eighteen columns

Section 41 suggests six `*_score` integer columns on `evaluations`. Per-dimension evidence and explanation text are always read/written together with the scores as one structured unit (never queried independently), so they live in `structured_evidence jsonb` keyed by dimension rather than as twelve more columns. This mirrors the AI's structured output shape directly, simplifying validation and persistence.

## Next.js version: pinned to 15.x, not the 16.x that `create-next-app@latest` installs

`create-next-app@latest` currently scaffolds Next.js 16, which ships an auto-generated `AGENTS.md` explicitly warning that it has breaking changes not reflected in model training data. Given the size and correctness-sensitivity of this build (auth middleware, streaming route handlers, server actions across dozens of files), the safer choice was Next.js 15 — stable, extensively documented, and what this implementation has high confidence in getting right on the first pass. Revisit once 16 has been out long enough to have reliable documentation/community patterns.

## Component library: hand-rolled shadcn-style primitives, not the shadcn CLI

The shadcn CLI is interactive and pulls in Radix primitives per component. For the MVP's actual component surface (button, card, input, textarea, select, badge, dialog-ish sheet, tabs, slider), hand-writing them once in `src/components/ui` using `clsx`/`tailwind-merge`/`class-variance-authority` gets the same restrained visual language with fewer dependencies and no CLI/network dependency during build. Can be migrated to the real shadcn CLI later with minimal disruption since the API shape is intentionally similar.

## Color palette

Warm cream background, deep charcoal-navy text, muted terracotta accent (primary actions/AI character), muted sage green for positive/improvement signals — implemented as CSS custom properties in `globals.css` via Tailwind v4's `@theme inline`, with a dark-mode variant. Chosen directly from section 49 of the brief; avoids anything neon/glowing/robotic per section 48.
