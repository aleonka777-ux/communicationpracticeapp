# CLAUDE.md — Virtual Communication Coach

Operational instructions for anyone (human or AI) working in this repo. Keep this file concise and current.

## Product

A mobile-first web app for practising interpersonal communication techniques through spoken/text role-play with an AI interlocutor, followed by evidence-based AI coaching feedback. Core loop:

**Choose skill → Choose scenario → Practise → Receive feedback → Repeat → Compare attempts → Improve**

This is a practice tool, not a course, not a generic chatbot, not therapy. See `/docs/ARCHITECTURE.md` for system design and `/docs/BUILD_PLAN.md` for phased scope.

## The two AI roles (never blur these)

- **Interlocutor** (`src/lib/simulation/*`): plays a character during the live conversation. Stays in character. Never coaches, scores, or praises.
- **Coach** (`src/lib/coaching/*`): only runs after the conversation ends (or on-demand for a hint in Training Mode). Produces structured, validated, evidence-based feedback.

These live in separate modules with separate prompt builders. Do not merge them into one "do everything" prompt.

## Architecture summary

- Next.js 15 (App Router) + TypeScript + Tailwind v4, deployed on Vercel.
- Supabase Postgres + Auth + RLS for all persistent state. No in-memory/server-process state survives a request — conversations are turn-based HTTP requests that read/write Supabase each turn.
- Provider abstractions: `AIProvider` (`src/lib/ai`), `SpeechToTextProvider` / `TextToSpeechProvider` (`src/lib/voice`). Concrete implementations (OpenAI) live behind these interfaces; a deterministic `MockProvider` is used when API keys are absent so the app runs without credentials.
- All external AI/voice calls happen server-side (Route Handlers / Server Actions). Client code never sees provider API keys.

## Key directories

- `src/app` — routes (App Router). `(auth)` for login/signup, `(app)` for the authenticated shell, `admin` for coach/admin CRUD, `api` for route handlers.
- `src/components` — `ui` (hand-rolled restrained primitives, shadcn-style), `practice`, `feedback`, `admin`, `layout`.
- `src/lib/supabase` — browser/server/admin Supabase clients.
- `src/lib/ai` — `AIProvider` interface + `openai`/`mock` implementations + factory.
- `src/lib/voice` — STT/TTS interfaces + implementations + factory.
- `src/lib/simulation` — prompt builder + engine for the interlocutor, conversation state machine.
- `src/lib/coaching` — evaluation prompt builder, zod schemas, scoring/weights, attempt comparison, hints.
- `src/lib/db` — typed Supabase query functions (one file per entity). UI and API routes call these, never raw Supabase queries scattered around.
- `supabase/migrations` — SQL migrations (schema + RLS). `supabase/seed.sql` — demo content (5 tools × 2 scenarios).
- `tests/unit` (Vitest) — deterministic logic. `tests/e2e` (Playwright) — happy-path with mocked AI/voice.

## Coding conventions

- Strict TypeScript. No `any` in application code (route handlers, lib, components); narrow `unknown` from external/AI input explicitly.
- Validate all LLM output with zod before persisting or trusting it. Never `JSON.parse` model output and use it directly.
- Server-only secrets: only read `process.env.*` provider keys inside `src/lib/**` server modules or `src/app/api/**`/server actions — never in a `"use client"` file.
- DB access goes through `src/lib/db/*`, not ad hoc Supabase calls in components/routes.
- Prefer Server Components for data fetching; use Client Components only where interactivity (mic, timer, forms) requires it.
- Keep interlocutor turns concise (a few sentences) — this is enforced in the prompt builder, not just hoped for.

## Key commands

```
npm run dev          # local dev server
npm run build         # production build (must pass before considering work done)
npm run lint          # eslint
npm run typecheck     # tsc --noEmit
npm run test          # vitest unit tests
npm run test:e2e      # playwright e2e (uses mock AI/voice providers)
```

Supabase (requires Supabase CLI + linked project, see README):
```
supabase db push      # apply migrations
supabase db reset      # reset local db + reseed
```

## Security constraints

- Row Level Security is the authorization boundary for user data (sessions, messages, evaluations). Every table holding user data has RLS enabled with owner-only policies. Server code still checks `auth.uid()` explicitly before writes — RLS is defense in depth, not the only check.
- `SUPABASE_SERVICE_ROLE_KEY` is server-only, used only for admin/coach operations that legitimately need to bypass RLS (e.g. seeding), never exposed to the client, never used to serve ordinary user requests.
- Transcripts are sensitive. Do not log full transcript text. Log event types/ids only (see `src/lib/observability`).
- Users can delete their own practice sessions (cascades to messages/evaluations).

## Explicitly excluded from MVP

Video avatars, native mobile apps, gamification/streaks/badges, multiplayer/social, payments/subscriptions, push notifications, user-created scenarios, adaptive difficulty, fine-tuning, full analytics dashboards. See `/docs/BUILD_PLAN.md` section "Out of scope" for the full list — do not build these without an explicit request.

## Testing expectations

Every phase that adds deterministic logic (timer, state machine, scoring/weights, attempt numbering, comparison, schema validation, authorization) needs a Vitest unit test. The core user journey needs one Playwright e2e test using mocked providers (no live model/API calls in CI).
