-- Separates two distinct concepts that a single "confirmed barge-in" count previously conflated:
--
-- 1. Technical confirmed barge-in: any event where the barge-in controller (src/lib/realtime/
--    bargeIn.ts) confirms and cancels a pending or active AI response. Useful for debugging/session
--    control. Every one is still recorded here, unconditionally.
-- 2. Audible user interruption: a confirmed barge-in where AI audio was ACTUALLY PLAYING at the
--    moment of confirmation — the user spoke over something they could hear. This, not the raw
--    technical count, is the coaching-relevant interruption metric.
--
-- Root cause this addresses: bargeIn.ts treats the AI as "speaking" from response.created onward
-- (to close a media/data-channel ordering race), which is earlier than this schema's own AI-turn
-- interval (output_audio_buffer.started -> .stopped, i.e. actual playback). A barge-in confirmed in
-- that gap — the response was still being generated and had not yet produced any audio — is a real
-- technical cancellation but NOT an audible interruption, and must not inflate the coaching-facing
-- count. See /docs/DECISIONS.md for the full analysis.
--
-- Additive, in-place: no table drop/recreate, no RLS/constraint changes, no existing conversation,
-- evaluation, or prior timing-metrics data touched.

alter table public.realtime_turn_events
  add column if not exists barge_in_context text check (barge_in_context in ('audible', 'pre_playback'));

comment on column public.realtime_turn_events.barge_in_context is 'confirmed_barge_in rows only. "audible": AI audio was actually playing — the coaching-relevant case. "pre_playback": the response had been created but had not yet produced audio — a real technical cancellation, not an audible interruption. Null for every other kind.';

alter table public.realtime_session_metrics
  add column if not exists technical_barge_in_count integer not null default 0;

comment on column public.realtime_session_metrics.confirmed_interruption_count is 'Coaching-facing interruption count: confirmed barge-ins with barge_in_context = ''audible'' ONLY. Always <= technical_barge_in_count. This is a semantics fix — this column previously counted every confirmed barge-in regardless of whether AI audio was actually playing.';
comment on column public.realtime_session_metrics.technical_barge_in_count is 'Diagnostic total: every confirmed barge-in regardless of context (audible + pre_playback). For debugging/session-control visibility only — never used as a coaching signal.';
