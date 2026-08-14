-- Practice sessions: one row per practice attempt.
create table if not exists public.practice_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  scenario_id uuid not null references public.scenarios (id) on delete restrict,
  tool_id uuid not null references public.communication_tools (id) on delete restrict,
  mode text not null default 'realistic' check (mode in ('realistic', 'training')),
  selected_duration_seconds integer not null default 180
    check (selected_duration_seconds in (120, 180, 300)),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  status text not null default 'in_progress'
    check (status in ('in_progress', 'evaluating', 'completed', 'abandoned')),
  attempt_number integer not null default 1,
  hint_count integer not null default 0,
  readiness_rating integer check (readiness_rating between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.practice_sessions is 'One row per practice attempt at a scenario.';
comment on column public.practice_sessions.attempt_number is 'Sequential attempt count for this user+scenario, computed server-side at creation.';

create trigger practice_sessions_set_updated_at
  before update on public.practice_sessions
  for each row execute function public.set_updated_at();

create index if not exists practice_sessions_user_id_idx on public.practice_sessions (user_id);
create index if not exists practice_sessions_scenario_user_idx on public.practice_sessions (scenario_id, user_id, attempt_number desc);
create index if not exists practice_sessions_status_idx on public.practice_sessions (status);

alter table public.practice_sessions enable row level security;
