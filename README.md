# Virtual Communication Coach

A mobile-first web app for practising interpersonal communication techniques through spoken/text role-play with an AI interlocutor, followed by evidence-based AI coaching feedback.

**Choose skill → Choose scenario → Practise → Receive feedback → Repeat → Compare attempts → Improve**

See [`CLAUDE.md`](./CLAUDE.md) for operational conventions and [`/docs`](./docs) for full architecture, build plan, decisions, and status.

## Architecture at a glance

- **Next.js 15** (App Router) + TypeScript + Tailwind v4, deployed on **Vercel**.
- **Supabase** Postgres + Auth + Row Level Security for all persistent state.
- **AI**: an `AIProvider` interface (`src/lib/ai`) with an OpenAI implementation and a deterministic mock used automatically when no API key is configured.
- **Voice**: `SpeechToTextProvider` / `TextToSpeechProvider` interfaces (`src/lib/voice`), same OpenAI/mock pattern.
- Two clearly separated AI roles: the **interlocutor** (`src/lib/simulation`, plays a character live) and the **coach** (`src/lib/coaching`, analyzes the finished transcript). See `CLAUDE.md`.

Full details: [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md).

## Tech stack

Next.js 15 · React 19 · TypeScript (strict) · Tailwind CSS v4 · Supabase (Postgres, Auth, RLS) · OpenAI SDK · Zod · Vitest · Playwright.

## Local setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create a Supabase project

1. Create a project at [supabase.com](https://supabase.com) (or run one locally with the [Supabase CLI](https://supabase.com/docs/guides/cli): `supabase init && supabase start`).
2. Apply the migrations:
   ```bash
   supabase link --project-ref <your-project-ref>   # for a hosted project
   supabase db push
   ```
   For a local stack, `supabase start` already applies `supabase/migrations` automatically.
3. Seed demo content (5 communication tools × 2 scenarios each):
   ```bash
   psql "$(supabase status -o env | grep DB_URL | cut -d= -f2)" -f supabase/seed.sql
   # or, against a hosted project, run supabase/seed.sql via the SQL editor in the dashboard
   ```
4. Promote your own account to `coach` so you can reach `/admin` (after signing up once in the app):
   ```sql
   update public.profiles set role = 'coach' where id = '<your-auth-user-id>';
   ```

### 3. Configure environment variables

```bash
cp .env.example .env.local
```

Fill in `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` from your Supabase project's API settings. `OPENAI_API_KEY` is optional — see below.

### 4. Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Running without an AI provider (demo mode)

If `OPENAI_API_KEY` is unset, the app automatically uses a deterministic mock `AIProvider` and voice is disabled with a clear in-app notice — the full text practice loop (setup → conversation → evaluation → feedback → try again) still works end-to-end with zero external AI credentials. This is intentional (see `docs/DECISIONS.md`) so the product can be reviewed and tested without paying for API calls. Set `OPENAI_API_KEY` to get real interlocutor replies, coaching evaluation, speech-to-text, and text-to-speech.

## Voice modes: batch (default) vs. Realtime

Two voice implementations exist side by side (see `docs/ARCHITECTURE.md` §9): the original record → transcribe → reply → speak batch flow, and a newer Realtime (WebRTC speech-to-speech) flow that feels like an actual live conversation. Realtime is off by default — set `REALTIME_VOICE_ENABLED=true` (with `OPENAI_API_KEY` already set) to turn it on. It can be escaped per-session at any time by visiting `/practice/<sessionId>?voiceMode=batch`, which the Realtime screen also offers automatically if its connection fails. See `docs/DECISIONS.md` "Realtime voice rollout" for the full picture, including the one part of the implementation (the WebRTC connect endpoint) that's inferred from the OpenAI SDK's types rather than confirmed against a live test — worth double-checking first when trying this in production.

## Environment variables

See [`.env.example`](./.env.example) for the full list with descriptions. Never commit real secrets — `.env*` is gitignored.

## Database migrations

Plain SQL files in `supabase/migrations`, applied in order via the Supabase CLI (`supabase db push`) or `supabase db reset` locally (which also re-applies `supabase/seed.sql`). No ORM — see `docs/DECISIONS.md` for why.

## Tests

```bash
npm run test        # Vitest — deterministic logic (timer, state machine, scoring, attempt
                     # numbering/comparison, schema validation, authorization checks)
npm run test:e2e     # Playwright — full happy-path flow with the AI provider mocked
```

The Playwright test requires a real (test) Supabase project with migrations and `supabase/seed.sql` applied — it signs up a throwaway user and walks the actual practice loop end to end. It never calls a live AI model (no `OPENAI_API_KEY` needed for it to pass — the mock provider is used automatically). The pre-installed Chromium at `$PLAYWRIGHT_BROWSERS_PATH` is used automatically; elsewhere, run `npx playwright install chromium` first.

## Production build

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

All four must pass before considering a change done (see CLAUDE.md).

## Admin / coach setup

Any authenticated user can be promoted to `role = 'coach'` directly in the `profiles` table (see step 4 above — this is deliberately not self-service, to prevent privilege escalation via the app). Coaches get a "Coach" tab in the bottom navigation leading to `/admin`, where they can create/edit communication tools and scenarios without touching code.

## Deploying to Vercel

1. Push this repository to GitHub and import it in Vercel.
2. Framework preset: Next.js (auto-detected).
3. Add the environment variables from `.env.example` in Project Settings → Environment Variables, for Production (and Preview, if you want preview deployments to work against the same or a separate Supabase project).
4. Deploy. Route handlers run on the Node.js runtime (not Edge) since the Supabase and OpenAI SDKs need Node APIs — this is already configured per-route (`export const runtime = "nodejs"`).
5. No filesystem writes or in-process state are relied on anywhere — every request is stateless and reads/writes Supabase, so it's safe to scale across serverless instances.

## Deployment considerations

- **Cold starts / statelessness**: conversation turns are independent, stateless HTTP requests (see `docs/ARCHITECTURE.md` §7) — a refresh or a request landing on a different serverless instance never loses data, because everything is persisted to Postgres before the response is returned.
- **Voice**: implemented as turn-based HTTP (record → transcribe → respond → synthesize → play), not a long-lived realtime connection, so it fits Vercel's execution model without extra infrastructure.
- **Secrets**: `SUPABASE_SERVICE_ROLE_KEY` and `OPENAI_API_KEY` are read only in server-only modules (enforced by the `server-only` package failing the build if imported from client code).

## Known limitations (MVP)

See `docs/STATUS.md` for the current, living list. Notably: no live Supabase/OpenAI credentials were available while building this in the current session, so the full stack has been verified via lint/typecheck/unit tests/production build, not a live end-to-end run — see `docs/STATUS.md` for exactly what still needs a real project to verify.
