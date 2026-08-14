-- Communication tools: the coach's methodology library. Fully editable, no code changes needed.
create table if not exists public.communication_tools (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  short_description text not null default '',
  purpose text not null default '',
  when_to_use text not null default '',
  core_principles jsonb not null default '[]'::jsonb,
  step_by_step_method jsonb not null default '[]'::jsonb,
  good_examples jsonb not null default '[]'::jsonb,
  weak_examples jsonb not null default '[]'::jsonb,
  common_mistakes jsonb not null default '[]'::jsonb,
  evaluation_criteria jsonb not null default '{}'::jsonb,
  coaching_guidance text not null default '',
  evaluation_weights jsonb not null default
    '{"clarity":0.2,"assertiveness":0.2,"acknowledgment":0.15,"non_escalation":0.15,"technique":0.2,"effectiveness":0.1}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.communication_tools is 'Coach-editable communication technique methodology (Layer 1 AI knowledge source).';
comment on column public.communication_tools.core_principles is 'Array of short strings.';
comment on column public.communication_tools.step_by_step_method is 'Array of {step, description} objects.';
comment on column public.communication_tools.good_examples is 'Array of short example strings.';
comment on column public.communication_tools.weak_examples is 'Array of short example strings.';
comment on column public.communication_tools.common_mistakes is 'Array of short strings.';
comment on column public.communication_tools.evaluation_criteria is 'Object keyed by dimension (clarity, assertiveness, acknowledgment, non_escalation, technique, effectiveness) with guidance text.';
comment on column public.communication_tools.evaluation_weights is 'Object of six numeric weights keyed by dimension, expected to sum to ~1.0.';

create trigger communication_tools_set_updated_at
  before update on public.communication_tools
  for each row execute function public.set_updated_at();

create index if not exists communication_tools_active_idx on public.communication_tools (active);

alter table public.communication_tools enable row level security;
