-- Evaluations: one validated coaching evaluation per completed session.
create table if not exists public.evaluations (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references public.practice_sessions (id) on delete cascade,
  clarity_score smallint not null check (clarity_score between 1 and 5),
  assertiveness_score smallint not null check (assertiveness_score between 1 and 5),
  acknowledgment_score smallint not null check (acknowledgment_score between 1 and 5),
  non_escalation_score smallint not null check (non_escalation_score between 1 and 5),
  technique_score smallint not null check (technique_score between 1 and 5),
  effectiveness_score smallint not null check (effectiveness_score between 1 and 5),
  overall_summary text not null,
  strengths jsonb not null default '[]'::jsonb,
  improvements jsonb not null default '[]'::jsonb,
  next_focus text not null default '',
  structured_evidence jsonb not null default '{}'::jsonb,
  comparison_data jsonb,
  evaluator_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.evaluations is 'Layer 3 coaching output: schema-validated before insert, never partial/corrupt.';
comment on column public.evaluations.strengths is 'Array of {point, evidence} objects.';
comment on column public.evaluations.improvements is 'Array of {issue, why_it_matters, suggestion, example} objects.';
comment on column public.evaluations.structured_evidence is 'Object keyed by dimension: {evidence, explanation}.';
comment on column public.evaluations.comparison_data is 'Null for attempt 1. Otherwise {previous_session_id, score_deltas, qualitative_notes}.';
comment on column public.evaluations.evaluator_metadata is 'Provider/model id, prompt version, retry count — for observability, never transcript content.';

create index if not exists evaluations_session_id_idx on public.evaluations (session_id);

alter table public.evaluations enable row level security;
