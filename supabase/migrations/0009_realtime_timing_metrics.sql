-- Objective conversational timing + interruption metrics for Realtime practice sessions. Purely
-- additive: does not touch practice_sessions, conversation_messages, or evaluations. No raw audio
-- is ever stored here — only event timestamps (ms relative to session start), durations, and
-- small structured metadata. See /docs/DECISIONS.md "Realtime timing metrics" for the full design
-- and the event-source audit this is built from.

-- One row per user turn, AI turn, overlap interval, or confirmed barge-in — enough to reconstruct
-- the whole conversation timeline for one session via `order by start_ms`.
create table if not exists public.realtime_turn_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.practice_sessions (id) on delete cascade,
  kind text not null check (kind in ('user_turn', 'ai_turn', 'overlap', 'confirmed_barge_in')),
  turn_index integer,
  start_ms integer not null,
  end_ms integer,
  duration_ms integer,
  duration_source text check (duration_source in ('server_vad', 'client_playback')),
  server_audio_start_ms integer,
  server_audio_end_ms integer,
  was_interrupted boolean,
  ended_by_session_close boolean,
  response_status text check (response_status in ('completed', 'cancelled', 'failed', 'incomplete', 'in_progress')),
  realtime_item_id text,
  realtime_response_id text,
  message_id uuid references public.conversation_messages (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.realtime_turn_events is 'Per-turn/per-event timing evidence for one Realtime practice session — no raw audio, ever. Reconstruct the timeline via order by start_ms.';
comment on column public.realtime_turn_events.kind is 'user_turn / ai_turn: a speaking turn. overlap: intersection of a user and an AI interval. confirmed_barge_in: the existing barge-in controller''s confirmed interruption, NOT every raw VAD speech_started.';
comment on column public.realtime_turn_events.duration_source is 'user_turn only: server_vad when the server''s own audio_start_ms/audio_end_ms were available (preferred, most precise), client_playback when falling back to client receipt-time timing.';
comment on column public.realtime_turn_events.was_interrupted is 'ai_turn only: true iff this turn was cut short by a confirmed user barge-in or a response cancellation — distinct from ended_by_session_close.';
comment on column public.realtime_turn_events.ended_by_session_close is 'True when the turn never received its natural stop event and was closed only because the session ended (e.g. manual End Practice, which does not wait for the exchange to finish).';
comment on column public.realtime_turn_events.realtime_item_id is 'OpenAI Realtime item_id, for user_turn rows — external API id, not a foreign key, kept for raw traceability.';
comment on column public.realtime_turn_events.realtime_response_id is 'OpenAI Realtime response_id, for ai_turn (and correlated overlap/confirmed_barge_in) rows.';
comment on column public.realtime_turn_events.metadata is 'Small structured extras only (e.g. cancellation reason) — the analytics model is NOT dumped into this blob; stable/known metrics are real columns above.';

create index if not exists realtime_turn_events_session_id_idx on public.realtime_turn_events (session_id, start_ms);

alter table public.realtime_turn_events enable row level security;

-- One row per session — derived aggregate metrics, recomputed and upserted at session finalization.
create table if not exists public.realtime_session_metrics (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references public.practice_sessions (id) on delete cascade,
  total_duration_ms integer not null,
  user_turn_count integer not null default 0,
  ai_turn_count integer not null default 0,
  total_user_speaking_ms integer not null default 0,
  total_ai_speaking_ms integer not null default 0,
  user_speaking_percentage numeric(5, 2) not null default 0,
  ai_speaking_percentage numeric(5, 2) not null default 0,
  total_overlap_ms integer not null default 0,
  overlap_count integer not null default 0,
  confirmed_interruption_count integer not null default 0,
  avg_user_turn_duration_ms integer,
  longest_user_turn_ms integer,
  avg_ai_turn_duration_ms integer,
  avg_user_response_latency_ms integer,
  median_user_response_latency_ms integer,
  longest_user_response_latency_ms integer,
  avg_ai_response_latency_ms integer,
  median_ai_response_latency_ms integer,
  computed_at timestamptz not null default now()
);

comment on table public.realtime_session_metrics is 'Session-level derived timing/interruption metrics. Not yet used by the Evaluation Engine or shown in production UI — a measurement layer only (see /docs/DECISIONS.md).';
comment on column public.realtime_session_metrics.avg_user_response_latency_ms is 'Coaching-relevant candidate for later use: user speech start minus the immediately preceding non-overlapping AI turn''s end. Excludes overlapping/interrupted exchanges by construction.';
comment on column public.realtime_session_metrics.avg_ai_response_latency_ms is 'System/product-quality metric ONLY (network + model latency) — never a user communication-performance signal, and must never be used to penalize a user for slow infrastructure.';

create index if not exists realtime_session_metrics_session_id_idx on public.realtime_session_metrics (session_id);

alter table public.realtime_session_metrics enable row level security;

-- RLS policies, following the same owner-via-practice_sessions pattern as conversation_messages
-- and evaluations in 0007_rls_policies.sql (kept as a separate migration rather than editing that
-- one, per the project's "never modify old production migrations" convention).

create policy "turn_events_select_own" on public.realtime_turn_events
  for select using (
    exists (
      select 1 from public.practice_sessions s
      where s.id = realtime_turn_events.session_id and s.user_id = auth.uid()
    )
  );

create policy "turn_events_insert_own" on public.realtime_turn_events
  for insert with check (
    exists (
      select 1 from public.practice_sessions s
      where s.id = realtime_turn_events.session_id and s.user_id = auth.uid()
    )
  );

-- Delete-then-reinsert is how session finalization stays idempotent if it's ever retried (e.g. a
-- transient network failure right after the first attempt's insert succeeded).
create policy "turn_events_delete_own" on public.realtime_turn_events
  for delete using (
    exists (
      select 1 from public.practice_sessions s
      where s.id = realtime_turn_events.session_id and s.user_id = auth.uid()
    )
  );

create policy "session_metrics_select_own" on public.realtime_session_metrics
  for select using (
    exists (
      select 1 from public.practice_sessions s
      where s.id = realtime_session_metrics.session_id and s.user_id = auth.uid()
    )
  );

create policy "session_metrics_insert_own" on public.realtime_session_metrics
  for insert with check (
    exists (
      select 1 from public.practice_sessions s
      where s.id = realtime_session_metrics.session_id and s.user_id = auth.uid()
    )
  );

-- Update is needed (not just insert) so finalization can safely upsert-by-session_id if it's retried.
create policy "session_metrics_update_own" on public.realtime_session_metrics
  for update using (
    exists (
      select 1 from public.practice_sessions s
      where s.id = realtime_session_metrics.session_id and s.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.practice_sessions s
      where s.id = realtime_session_metrics.session_id and s.user_id = auth.uid()
    )
  );
