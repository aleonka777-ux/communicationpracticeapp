-- Records, for diagnostics, whether a confirmed_barge_in row actually counted toward the
-- coaching-facing confirmed_interruption_count, following the idempotent-per-AI-response fix in
-- src/lib/realtime/sessionTimeline.ts (a single deliberate interruption can legitimately generate
-- more than one raw confirmed-barge-in callback against the same still-active AI response; only
-- the first is counted, the rest are recorded for diagnostics but excluded from the coaching
-- metric). No behavior/data change to any other column; purely additive.
--
-- This migration does not itself change how total_ai_speaking_ms/total_overlap_ms/response-latency
-- are computed — that fix is entirely in application code (an AI turn now closes reliably on
-- output_audio_buffer.cleared or a non-"completed" response.done, instead of sometimes staying open
-- until session finalize). See /docs/DECISIONS.md for the full root-cause analysis. No new column
-- is needed for that fix since it only changes WHEN existing columns (end_ms, duration_ms, etc.)
-- get populated, not their shape.

alter table public.realtime_turn_events
  add column if not exists counts_toward_interruption boolean;

comment on column public.realtime_turn_events.counts_toward_interruption is 'confirmed_barge_in rows only. False for a repeat confirmation against an AI response already counted as an audible interruption, or for a pre_playback context. Null for every other kind. See src/lib/realtime/sessionTimeline.ts''s doc comment on idempotent audible interruption.';
