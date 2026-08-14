-- Scenarios: specific role-play setups belonging to a communication tool.
create table if not exists public.scenarios (
  id uuid primary key default gen_random_uuid(),
  tool_id uuid not null references public.communication_tools (id) on delete cascade,
  title text not null,
  context text not null default '',
  user_role text not null default '',
  user_objective text not null default '',
  ai_role text not null default '',
  relationship text not null default '',
  ai_personality text not null default '',
  ai_objective text not null default '',
  emotional_intensity text not null default 'moderate'
    check (emotional_intensity in ('low', 'moderate', 'high')),
  difficulty text not null default 'intermediate'
    check (difficulty in ('beginner', 'intermediate', 'advanced')),
  opening_line text not null default '',
  character_behaviours jsonb not null default '[]'::jsonb,
  escalation_rules jsonb not null default '[]'::jsonb,
  deescalation_rules jsonb not null default '[]'::jsonb,
  scenario_constraints jsonb not null default '[]'::jsonb,
  evaluation_overrides jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.scenarios is 'Coach-editable role-play scenarios (Layer 2 simulation configuration).';
comment on column public.scenarios.character_behaviours is 'Array of short behavioural instruction strings for the AI interlocutor.';
comment on column public.scenarios.escalation_rules is 'Array of conditions under which the character becomes more resistant.';
comment on column public.scenarios.deescalation_rules is 'Array of conditions under which the character becomes more cooperative.';
comment on column public.scenarios.scenario_constraints is 'Array of hard constraints/safety limits for the AI character (e.g. no graphic content).';
comment on column public.scenarios.evaluation_overrides is 'Optional partial override, e.g. {"weights": {...}}, merged over the parent tool defaults.';

create trigger scenarios_set_updated_at
  before update on public.scenarios
  for each row execute function public.set_updated_at();

create index if not exists scenarios_tool_id_idx on public.scenarios (tool_id);
create index if not exists scenarios_active_idx on public.scenarios (active);

alter table public.scenarios enable row level security;
