-- Fixes a production persistence bug: /api/simulation/realtime/metrics failed on every session
-- with Postgres error 22P02 ("invalid input syntax for type integer: \"16258.5\""), leaving
-- realtime_turn_events and realtime_session_metrics permanently empty.
--
-- Root cause: several columns created in 0009 as `integer` actually receive client
-- performance.now()-derived monotonic-clock milliseconds (src/lib/realtime/sessionTimeline.ts),
-- which are inherently fractional (JS performance.now() has sub-millisecond resolution), plus
-- arithmetic derived from them (durations, sums, averages, medians). Postgres correctly rejects a
-- fractional value written to an `integer` column — the columns' declared type was wrong, not the
-- application data. See /docs/DECISIONS.md "Realtime timing metrics, numeric type fix" for the
-- full field-by-field audit.
--
-- 0009 has already been applied to production, so this is a new, additive, in-place ALTER
-- migration — no table drop/recreate, no RLS/constraint changes, no existing conversation or
-- evaluation data touched. The two affected tables are confirmed empty in production (every prior
-- insert attempt failed), so there is no data to migrate, but the ALTER ... USING clauses below
-- are written to be safe even if that were not the case.
--
-- Counter columns (user_turn_count, ai_turn_count, overlap_count, confirmed_interruption_count,
-- suspected_noise_event_count) and turn_index are untouched — they are always whole numbers
-- (array lengths / increments) and correctly typed as integer already.

alter table public.realtime_turn_events
  alter column start_ms type double precision using start_ms::double precision,
  alter column end_ms type double precision using end_ms::double precision,
  alter column duration_ms type double precision using duration_ms::double precision,
  -- OpenAI's Realtime API types audio_start_ms/audio_end_ms as plain `number`, not documented as
  -- integer-only, and offsets derived from audio sample counts can in principle be fractional
  -- milliseconds depending on sample rate — the same class of risk as the client-clock fields
  -- above, so these are converted proactively rather than assumed safe.
  alter column server_audio_start_ms type double precision using server_audio_start_ms::double precision,
  alter column server_audio_end_ms type double precision using server_audio_end_ms::double precision;

comment on column public.realtime_turn_events.start_ms is 'Milliseconds relative to session start, from the client monotonic clock (performance.now()) — inherently fractional, hence double precision, not integer.';
comment on column public.realtime_turn_events.end_ms is 'See start_ms — same clock, same fractional precision.';
comment on column public.realtime_turn_events.duration_ms is 'end_ms - start_ms (or server_audio_end_ms - server_audio_start_ms for a server_vad-timed user turn) — fractional for the same reason as start_ms/end_ms.';
comment on column public.realtime_turn_events.server_audio_start_ms is 'user_turn rows only. OpenAI Realtime audio_start_ms — typed double precision since the SDK does not guarantee an integer millisecond offset.';
comment on column public.realtime_turn_events.server_audio_end_ms is 'user_turn rows only. OpenAI Realtime audio_end_ms — see server_audio_start_ms.';

alter table public.realtime_session_metrics
  alter column total_duration_ms type double precision using total_duration_ms::double precision,
  alter column total_user_speaking_ms type double precision using total_user_speaking_ms::double precision,
  alter column total_ai_speaking_ms type double precision using total_ai_speaking_ms::double precision,
  alter column total_overlap_ms type double precision using total_overlap_ms::double precision,
  alter column avg_user_turn_duration_ms type double precision using avg_user_turn_duration_ms::double precision,
  alter column longest_user_turn_ms type double precision using longest_user_turn_ms::double precision,
  alter column avg_ai_turn_duration_ms type double precision using avg_ai_turn_duration_ms::double precision,
  alter column avg_user_response_latency_ms type double precision using avg_user_response_latency_ms::double precision,
  alter column median_user_response_latency_ms type double precision using median_user_response_latency_ms::double precision,
  alter column longest_user_response_latency_ms type double precision using longest_user_response_latency_ms::double precision,
  alter column avg_ai_response_latency_ms type double precision using avg_ai_response_latency_ms::double precision,
  alter column median_ai_response_latency_ms type double precision using median_ai_response_latency_ms::double precision;

-- ALTER COLUMN ... TYPE preserves NOT NULL but can drop a literal DEFAULT's applicability in some
-- Postgres versions for cross-type changes — restated explicitly rather than relying on it.
alter table public.realtime_session_metrics
  alter column total_user_speaking_ms set default 0,
  alter column total_ai_speaking_ms set default 0,
  alter column total_overlap_ms set default 0;

comment on column public.realtime_session_metrics.total_duration_ms is 'elapsed() at finalize() — client monotonic clock, fractional, hence double precision.';
comment on column public.realtime_session_metrics.avg_user_turn_duration_ms is 'Arithmetic mean of fractional per-turn durations — always potentially fractional regardless of the inputs.';
comment on column public.realtime_session_metrics.median_user_response_latency_ms is 'Median of fractional latency samples — can land between two samples and be fractional even when every sample happens to be a whole number.';
