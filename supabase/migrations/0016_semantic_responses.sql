-- Audit finding that feeds directly into this phase (see /docs/DECISIONS.md): realtime_turn_events
-- has never persisted a user_turn's actual transcript TEXT — only derived word_count/speaking_rate_wpm
-- (see 0014_speech_delivery_evidence.sql). MetricsPayload already carries the transcript in memory at
-- POST time (src/lib/realtime/metricsPayload.ts's userTurnSchema) but it was simply discarded before
-- reaching this table. Combined-transcript evidence (section 12 of the Phase 4B.1A spec) is
-- impossible to build without it, and conversation_messages has no correlating key back to a specific
-- realtime_item_id, so this is the smallest, most direct fix: persist what was already being sent,
-- rather than inventing a fragile join. Purely additive; no existing column's meaning changes.
alter table public.realtime_turn_events
  add column if not exists transcript text;

comment on column public.realtime_turn_events.transcript is 'user_turn rows only. The turn''s final transcript text, verbatim (never paraphrased) — see src/lib/realtime/sessionTimeline.ts''s UserTurnMetric.transcript. Null when no transcript exists (never arrived, or transcription failed). Added for Phase 4B.1A''s combined-transcript evidence; RLS-protected identically to every other column on this table.';

-- Phase 4B.1A: Semantic Response Foundation. Purely additive derived-analytics layer sitting
-- between raw Realtime/VAD evidence (realtime_turn_events / realtime_pause_events /
-- realtime_disfluency_candidates, all untouched) and future communication interpretation. Does not
-- touch practice_sessions, conversation_messages, evaluations, or any existing realtime_* table's
-- meaning. No raw audio, no scoring, no coaching interpretation. See /docs/DECISIONS.md
-- "Phase 4B.1A: Semantic Response Foundation" for the full grouping-algorithm design and audit.
--
-- A Semantic Response is one or more adjacent CONFIRMED raw user_turn rows that deterministic
-- interaction/timing evidence indicates were one continuous human response mechanically split by
-- server VAD. Raw evidence is NEVER rewritten/merged/mutated here — a semantic response is derived,
-- recomputable data, versioned via grouping_algorithm_version. Recomputation follows the same
-- idempotent delete-then-reinsert-by-session_id pattern already established for
-- realtime_turn_events/realtime_pause_events/realtime_disfluency_candidates (see
-- 0009_realtime_timing_metrics.sql and 0014_speech_delivery_evidence.sql) — a session's semantic
-- responses are replaced wholesale on each recompute, so a future algorithm version does not need a
-- separate "grouping run" bookkeeping table to stay correct (see the DECISIONS.md audit for why a
-- semantic_grouping_runs table was considered and deliberately not built).

create table if not exists public.semantic_responses (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.practice_sessions (id) on delete cascade,
  response_index integer not null,
  grouping_algorithm_version text not null,
  start_ms double precision not null,
  end_ms double precision not null,
  span_duration_ms double precision not null,
  -- Confidence of the merge decision(s) that produced this response from its constituent raw
  -- turns. Deliberately NOT a check-constrained enum: Phase 4B.1A only ever produces 'high' (a
  -- multi-turn response) or null (a single-turn response — no merge decision was made, so no
  -- confidence applies). Left open (text, not enum) so a future Phase 4B.1B can introduce
  -- additional tiers (e.g. a linguistically-resolved 'medium') without a migration.
  grouping_confidence text,
  -- Reason codes explaining WHY constituent turns were (or were not, for a singleton) grouped —
  -- see src/lib/semanticResponse/grouping.ts for the fixed vocabulary. Never just `merged = true`:
  -- future debugging must be able to explain every grouping decision.
  grouping_reasons text[] not null default '{}',
  -- The boundary decision between the PREVIOUS semantic response's last turn and this response's
  -- first turn (null for the first response in a session). 'ambiguous' means deterministic V1
  -- evidence was insufficient to merge but a future Phase 4B.1B linguistic pass may reconsider —
  -- see section 7/24 Case 6 of the Phase 4B.1A spec. Never itself causes a merge in this phase.
  preceding_boundary_decision text check (preceding_boundary_decision in ('merge', 'separate', 'ambiguous')),
  preceding_boundary_gap_ms double precision,
  -- External OpenAI Realtime response_id of the AI turn immediately preceding this response in the
  -- strict-adjacency merged timeline (see src/lib/realtime/sessionTimeline.ts's own "conversational
  -- adjacency, not nearest-preceding-turn" fix) — not a foreign key, matching this codebase's
  -- existing convention for external Realtime ids. Null if none is validly adjacent.
  preceding_ai_response_id text,
  response_latency_ms double precision,
  transcript_coverage text not null check (transcript_coverage in ('complete', 'partial', 'missing')),
  -- Chronological concatenation of constituent turns' own transcripts, verbatim, no paraphrasing —
  -- only populated when transcript_coverage = 'complete'. Null otherwise (partial fragments are
  -- diagnosable via semantic_response_turns + realtime_turn_events directly, not fabricated here).
  combined_transcript text,
  word_count integer,
  semantic_response_wpm double precision,
  avg_relative_intensity double precision,
  peak_relative_intensity double precision,
  intensity_variability double precision,
  -- Neutral structural facts derived from existing raw evidence only — never a psychological
  -- inference. See src/lib/semanticResponse/build.ts.
  started_while_ai_speaking boolean,
  user_interrupted_ai boolean,
  was_interrupted_by_ai boolean,
  computed_at timestamptz not null default now(),
  unique (session_id, grouping_algorithm_version, response_index)
);

comment on table public.semantic_responses is 'Phase 4B.1A derived layer: one or more adjacent CONFIRMED raw user turns grouped into one human conversational response by deterministic interaction/timing evidence only (no linguistics, no LLM). Recomputable from unchanged raw evidence; replaced wholesale per session on each recompute. See /docs/DECISIONS.md.';
comment on column public.semantic_responses.grouping_algorithm_version is 'Identifies which deterministic algorithm produced this row (e.g. "semantic-v1-deterministic") — lets a future version coexist with or replace this data without ambiguity about provenance.';
comment on column public.semantic_responses.transcript_coverage is 'complete: every constituent turn has non-empty transcript text. partial: some but not all do. missing: none do. semantic_response_wpm/combined_transcript are only populated for complete — never fabricated for partial/missing.';
comment on column public.semantic_responses.response_latency_ms is 'How quickly the FIRST constituent turn began after the strictly-adjacent, non-overlapping preceding AI turn ended — same strict-adjacency semantics as realtime_session_metrics.avg_user_response_latency_ms, never scanned further back. Null if no such AI turn is validly adjacent.';
comment on column public.semantic_responses.started_while_ai_speaking is 'True iff the FIRST constituent turn''s audible_ai_response_id_at_start (realtime_turn_events) was non-null — the AI was audibly speaking the instant this response began.';
comment on column public.semantic_responses.user_interrupted_ai is 'True iff any constituent turn is attributed (by containing its start/end interval) to a confirmed_barge_in row with barge_in_context = ''audible'' — a genuine audible interruption occurred during this response.';
comment on column public.semantic_responses.was_interrupted_by_ai is 'True iff any constituent turn appears as the user side of a realtime_turn_events overlap row — AI audio was actually playing over part of this response.';

create index if not exists semantic_responses_session_id_idx on public.semantic_responses (session_id, response_index);

alter table public.semantic_responses enable row level security;

-- One row per constituent raw user turn, in order, carrying the bridge-gap evidence to the
-- PREVIOUS turn in the same response (null for the first turn). Kept separate from
-- semantic_responses (rather than an array/JSON column) so both the raw-turn membership and the
-- per-gap meaningful-pause evidence stay individually queryable/typed.
create table if not exists public.semantic_response_turns (
  id uuid primary key default gen_random_uuid(),
  -- Denormalized (also reachable via semantic_response_id -> semantic_responses.session_id) so RLS
  -- ownership can be checked directly on this table, matching every other realtime_* table's
  -- existing "own session_id column, own RLS policy" convention rather than requiring a join.
  session_id uuid not null references public.practice_sessions (id) on delete cascade,
  semantic_response_id uuid not null references public.semantic_responses (id) on delete cascade,
  -- External Realtime item_id of the constituent raw user turn — not a foreign key, matching
  -- realtime_turn_events.realtime_item_id's own established convention.
  realtime_item_id text not null,
  turn_order_in_response integer not null,
  -- Gap from the END of the previous turn in this SAME response to the START of this turn. Null
  -- for the first turn in a response (nothing precedes it within the response). This is internal,
  -- within-response bridge evidence — distinct from realtime_pause_events (energy-detected pauses
  -- WITHIN one raw turn) and from a between-response gap (which is simply not represented here at
  -- all, since it never became part of one response).
  gap_before_ms double precision,
  -- Whether this bridge gap is long enough to count as a meaningful pause under the SAME threshold
  -- already used for intra-turn pause detection (MIN_INTRA_PAUSE_MS, speechDeliveryTracker.ts) —
  -- never a newly-invented threshold. Null for the first turn (gap_before_ms is also null there).
  gap_counts_as_meaningful_pause boolean,
  unique (semantic_response_id, turn_order_in_response),
  unique (session_id, realtime_item_id)
);

comment on table public.semantic_response_turns is 'Phase 4B.1A: membership of raw user turns (by realtime_item_id) within a semantic_responses row, in chronological order, plus the bridge-gap evidence to the previous constituent turn. See /docs/DECISIONS.md.';
comment on column public.semantic_response_turns.gap_before_ms is 'Gap from the previous turn''s end to this turn''s start, WITHIN this same semantic response (a "VAD bridge gap") — null for the first turn. Never confused with a realtime_pause_events row (energy-detected, inside one raw turn) or an ordinary between-response gap (not represented — it was evidence the two turns are NOT one response).';
comment on column public.semantic_response_turns.gap_counts_as_meaningful_pause is 'True iff gap_before_ms >= MIN_INTRA_PAUSE_MS (250ms, the same constant realtime_pause_events detection already uses) — only such gaps should be folded into semantic-response-level pause aggregates; a sub-threshold VAD bridge gap (e.g. ~58ms) is technical segmentation evidence only, never a meaningful coaching pause.';

create index if not exists semantic_response_turns_response_id_idx on public.semantic_response_turns (semantic_response_id, turn_order_in_response);
create index if not exists semantic_response_turns_session_id_idx on public.semantic_response_turns (session_id);

alter table public.semantic_response_turns enable row level security;

-- RLS policies — same owner-via-practice_sessions pattern as every other realtime_* table
-- (0009_realtime_timing_metrics.sql, 0014_speech_delivery_evidence.sql). Delete-then-reinsert is
-- how a recompute stays idempotent, matching those tables' existing convention exactly.

create policy "semantic_responses_select_own" on public.semantic_responses
  for select using (
    exists (select 1 from public.practice_sessions s where s.id = semantic_responses.session_id and s.user_id = auth.uid())
  );

create policy "semantic_responses_insert_own" on public.semantic_responses
  for insert with check (
    exists (select 1 from public.practice_sessions s where s.id = semantic_responses.session_id and s.user_id = auth.uid())
  );

create policy "semantic_responses_delete_own" on public.semantic_responses
  for delete using (
    exists (select 1 from public.practice_sessions s where s.id = semantic_responses.session_id and s.user_id = auth.uid())
  );

create policy "semantic_response_turns_select_own" on public.semantic_response_turns
  for select using (
    exists (select 1 from public.practice_sessions s where s.id = semantic_response_turns.session_id and s.user_id = auth.uid())
  );

create policy "semantic_response_turns_insert_own" on public.semantic_response_turns
  for insert with check (
    exists (select 1 from public.practice_sessions s where s.id = semantic_response_turns.session_id and s.user_id = auth.uid())
  );

create policy "semantic_response_turns_delete_own" on public.semantic_response_turns
  for delete using (
    exists (select 1 from public.practice_sessions s where s.id = semantic_response_turns.session_id and s.user_id = auth.uid())
  );
