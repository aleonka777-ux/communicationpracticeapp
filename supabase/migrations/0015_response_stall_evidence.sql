-- Response-stall incident fix: adds the two new session-level fields for the "unanswered user
-- turn" system/product-quality diagnostic (see src/lib/realtime/sessionTimeline.ts's
-- UnansweredUserTurnMetric doc comment and /docs/DECISIONS.md "Response-stall incident"). Purely
-- additive: no existing column's meaning changes. The response-latency PAIRING fix itself
-- (conversational-adjacency instead of nearest-preceding-turn) is a computation-only change and
-- needs no schema change — avg/median/longest_user_response_latency_ms already had the correct
-- intended semantics, they were just computed incorrectly.

alter table public.realtime_session_metrics
  add column if not exists unanswered_user_turn_count integer not null default 0,
  add column if not exists longest_unanswered_stall_ms double precision;

comment on column public.realtime_session_metrics.unanswered_user_turn_count is 'System/product-quality diagnostic ONLY — NEVER a coaching signal. Count of confirmed user turns with no AI turn immediately following them (beyond MIN_UNANSWERED_GAP_MS) before either the next user turn or session end. See src/lib/realtime/sessionTimeline.ts.';
comment on column public.realtime_session_metrics.longest_unanswered_stall_ms is 'Longest such stall in this session, or null if none occurred.';
