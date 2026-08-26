-- Phase 4A: speech-delivery EVIDENCE (speaking rate, intra-utterance pauses, filler/disfluency
-- candidates, relative vocal intensity). Purely additive: does not touch practice_sessions,
-- conversation_messages, evaluations, or any existing realtime_turn_events/realtime_session_metrics
-- row's meaning. No raw audio is ever stored — only counts, durations, transcript-position
-- integers, and relative/unitless intensity scalars (never dB SPL). This is a measurement layer
-- only: not read by the Evaluation Engine, not surfaced in production UI, VOCAL_EVIDENCE_AVAILABLE
-- stays false. See /docs/DECISIONS.md "Phase 4A: speech-delivery evidence" for the full audit and
-- design rationale.

-- Per-user_turn speech-delivery scalars, alongside the existing per-turn timing columns — same
-- nature/shape as duration_ms etc. already on this row, so extending it (rather than a new table)
-- avoids an unnecessary join for the common case of reading one turn's evidence in one place.
alter table public.realtime_turn_events
  add column if not exists word_count integer,
  add column if not exists speaking_rate_wpm double precision,
  add column if not exists avg_relative_intensity double precision,
  add column if not exists peak_relative_intensity double precision,
  add column if not exists intensity_variability double precision;

comment on column public.realtime_turn_events.word_count is 'user_turn rows only. Literal whitespace-tokenized word count of the turn''s transcript. Null when no transcript exists.';
comment on column public.realtime_turn_events.speaking_rate_wpm is 'user_turn rows only. wordCount / (durationMs/60000). Null when word_count is null or below the MIN_WORDS_FOR_RATE floor (see src/lib/realtime/sessionTimeline.ts) — no "ideal" rate is implied anywhere.';
comment on column public.realtime_turn_events.avg_relative_intensity is 'user_turn rows only. RMS-derived, unitless, RELATIVE intensity (NEVER dB SPL — no calibrated measurement hardware exists). See src/lib/realtime/speechDeliveryTracker.ts. Null if the mic-energy monitor produced no samples for this turn.';
comment on column public.realtime_turn_events.peak_relative_intensity is 'user_turn rows only. Peak (max) RMS sample within the turn. Same unitless/relative caveat as avg_relative_intensity.';
comment on column public.realtime_turn_events.intensity_variability is 'user_turn rows only. Population standard deviation of the turn''s RMS samples — a neutral variability figure, not a judgment about vocal control or stability.';

-- One row per detected intra-utterance pause (a period of low mic energy inside an already-open,
-- CONFIRMED user turn) — a separate table, since this is a variable-cardinality event stream per
-- turn, not a stable per-turn scalar. See src/lib/realtime/speechDeliveryTracker.ts for the
-- adaptive-noise-floor detection method and the 250ms minimum-duration threshold's rationale.
create table if not exists public.realtime_pause_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.practice_sessions (id) on delete cascade,
  realtime_item_id text not null,
  start_ms double precision not null,
  duration_ms double precision not null,
  position_ratio double precision not null check (position_ratio >= 0 and position_ratio <= 1),
  position_bucket text not null check (position_bucket in ('beginning', 'middle', 'end')),
  created_at timestamptz not null default now()
);

comment on table public.realtime_pause_events is 'Phase 4A evidence: one row per intra-utterance pause detected via live mic-energy analysis inside a CONFIRMED user turn. No raw audio — timestamps/durations/position only. Never interpreted here as strategic/hesitant/awkward — see /docs/DECISIONS.md.';
comment on column public.realtime_pause_events.realtime_item_id is 'External Realtime item_id of the owning user turn — not a foreign key, matching realtime_turn_events.realtime_item_id''s own convention.';
comment on column public.realtime_pause_events.position_ratio is 'Where the pause began, 0 (turn start) to 1 (turn end), relative to the owning turn''s own span.';

create index if not exists realtime_pause_events_session_id_idx on public.realtime_pause_events (session_id, start_ms);

alter table public.realtime_pause_events enable row level security;

create policy "pause_events_select_own" on public.realtime_pause_events
  for select using (
    exists (select 1 from public.practice_sessions s where s.id = realtime_pause_events.session_id and s.user_id = auth.uid())
  );

create policy "pause_events_insert_own" on public.realtime_pause_events
  for insert with check (
    exists (select 1 from public.practice_sessions s where s.id = realtime_pause_events.session_id and s.user_id = auth.uid())
  );

-- Delete-then-reinsert is how session finalization stays idempotent if retried — same pattern as
-- realtime_turn_events (see 0009_realtime_timing_metrics.sql).
create policy "pause_events_delete_own" on public.realtime_pause_events
  for delete using (
    exists (select 1 from public.practice_sessions s where s.id = realtime_pause_events.session_id and s.user_id = auth.uid())
  );

-- One row per filler/disfluency CANDIDATE occurrence — deliberately a candidate/evidence table, not
-- a judgment table. `classification` is always 'unclassified' today; the column exists so a future
-- Phase 4B (not part of this migration) can update rows in place rather than needing a new table or
-- a schema migration to add the concept of a classification. See src/lib/realtime/fillerCandidates.ts
-- for why reliability differs by category — vocal_disfluency_candidate is explicitly an
-- undercount-only signal, never a claim of true incidence.
create table if not exists public.realtime_disfluency_candidates (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.practice_sessions (id) on delete cascade,
  realtime_item_id text not null,
  turn_index integer not null,
  category text not null check (category in ('vocal_disfluency_candidate', 'lexical_discourse_candidate', 'repetition_candidate')),
  classification text not null default 'unclassified' check (classification = 'unclassified'),
  phrase text not null,
  transcript_start_char integer not null,
  transcript_end_char integer not null,
  context_before text not null default '',
  context_after text not null default '',
  approx_session_ms double precision,
  created_at timestamptz not null default now()
);

comment on table public.realtime_disfluency_candidates is 'Phase 4A evidence: filler/disfluency CANDIDATE occurrences from transcript text only — never a proven filler, never scored. See src/lib/realtime/fillerCandidates.ts. classification is constrained to ''unclassified'' at the DB level today; a future Phase 4B migration will widen this check constraint when real classification values are introduced.';
comment on column public.realtime_disfluency_candidates.category is 'vocal_disfluency_candidate: best-effort, UNDERCOUNT-ONLY (Whisper-family transcription is known to inconsistently drop these). lexical_discourse_candidate: more reliable (real words). repetition_candidate: immediate word repetition, reliable independent of the above.';
comment on column public.realtime_disfluency_candidates.approx_session_ms is 'Estimated by proportional interpolation across the owning turn''s span — NOT a measured timestamp (no word-level timing is available from the current transcription pipeline).';

create index if not exists realtime_disfluency_candidates_session_id_idx on public.realtime_disfluency_candidates (session_id);

alter table public.realtime_disfluency_candidates enable row level security;

create policy "disfluency_candidates_select_own" on public.realtime_disfluency_candidates
  for select using (
    exists (select 1 from public.practice_sessions s where s.id = realtime_disfluency_candidates.session_id and s.user_id = auth.uid())
  );

create policy "disfluency_candidates_insert_own" on public.realtime_disfluency_candidates
  for insert with check (
    exists (select 1 from public.practice_sessions s where s.id = realtime_disfluency_candidates.session_id and s.user_id = auth.uid())
  );

create policy "disfluency_candidates_delete_own" on public.realtime_disfluency_candidates
  for delete using (
    exists (select 1 from public.practice_sessions s where s.id = realtime_disfluency_candidates.session_id and s.user_id = auth.uid())
  );

-- Session-level speech-delivery aggregates, alongside the existing timing/interruption aggregates —
-- same stable-scalar nature as avg_user_turn_duration_ms etc. already on this row.
alter table public.realtime_session_metrics
  add column if not exists avg_words_per_minute double precision,
  add column if not exists median_words_per_minute double precision,
  add column if not exists fastest_user_turn_wpm double precision,
  add column if not exists slowest_user_turn_wpm double precision,
  add column if not exists wpm_trend_slope_per_turn double precision,
  add column if not exists vocal_disfluency_candidate_count integer not null default 0,
  add column if not exists lexical_discourse_candidate_count integer not null default 0,
  add column if not exists repetition_candidate_count integer not null default 0,
  add column if not exists candidate_rate_per_100_words double precision,
  add column if not exists candidate_rate_per_minute_speaking double precision,
  add column if not exists intra_pause_count integer not null default 0,
  add column if not exists total_intra_pause_ms double precision not null default 0,
  add column if not exists avg_intra_pause_ms double precision,
  add column if not exists median_intra_pause_ms double precision,
  add column if not exists longest_intra_pause_ms double precision,
  add column if not exists pauses_per_minute_speaking double precision;

comment on column public.realtime_session_metrics.wpm_trend_slope_per_turn is 'Slope of a simple linear regression of WPM against turn order (WPM per turn). Null unless at least 3 turns qualify for a rate. Sign/magnitude only — never labeled "improving"/"declining" here.';
comment on column public.realtime_session_metrics.vocal_disfluency_candidate_count is 'Best-effort, UNDERCOUNT-ONLY — see realtime_disfluency_candidates.category''s comment. Never compare directly against lexical_discourse_candidate_count as if equally reliable.';
