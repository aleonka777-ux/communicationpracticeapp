-- Fixes a measurement-integrity bug: confirmed-barge-in classification (audible vs. pre_playback)
-- and attribution were computed by RE-READING shared mutable AI-turn state at CONFIRMATION time
-- (250ms-1500ms after the user's speech began), rather than capturing what was true at the moment
-- the candidate interruption interval actually STARTED. By confirmation time the AI's turn may
-- already have concluded or been closed for a reason unrelated to the interruption itself,
-- silently misclassifying a genuine mid-playback interruption as "pre_playback" (or leaving it
-- unattributed) purely because time had passed between the two moments. A production control test
-- (one deliberate, audible interruption) reproduced this: confirmed_interruption_count came back 0
-- and overlap came back a physically implausible 0.8ms.
--
-- Fix (application code, src/lib/realtime/sessionTimeline.ts): the AI response actively playing
-- audio is now snapshotted onto the user turn at input_audio_buffer.speech_started time, and that
-- snapshot — not live state — is what recordConfirmedBargeIn() reads. This column persists that
-- snapshot for diagnostics/audit, alongside the existing barge_in_context/counts_toward_interruption
-- columns from prior migrations.
--
-- Additive, in-place: no table drop/recreate, no RLS/constraint changes, no existing data touched.

alter table public.realtime_turn_events
  add column if not exists audible_ai_response_id_at_start text;

comment on column public.realtime_turn_events.audible_ai_response_id_at_start is 'user_turn rows only. The OpenAI Realtime response id that was actively playing audio at the instant this speech interval began — snapshotted then, never re-derived later. External API id, not a foreign key. Null if the AI was not audibly playing when this turn started, or for every non-user_turn kind. See src/lib/realtime/sessionTimeline.ts''s doc comment on classifying audible-vs-pre_playback at speech-start time.';
