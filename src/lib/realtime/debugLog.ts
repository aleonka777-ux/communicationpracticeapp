/**
 * Structured development/debug logging for live Realtime conversation events — separate from
 * finalizationLog.ts (which covers session-ending, not moment-to-moment conversation events).
 * Added to diagnose false-interruption reports (acoustic echo triggering a false
 * `speech_started` while the AI is talking): these logs are what let a developer tell apart a
 * real user barge-in, speaker echo, a short noise blip, and an actual spoken utterance, without
 * ever needing the raw audio itself. console.debug (not .info/.error) deliberately, since this is
 * verbose per-turn diagnostic detail, not a lifecycle milestone or a failure.
 *
 * Extended for the response-stall incident (see /docs/DECISIONS.md "Response-stall incident") to
 * cover every step of the response lifecycle explicitly, including ones the client never used to
 * mark at all (the server auto-creates a response via `turn_detection.create_response: true` —
 * there is no explicit client-sent `response.create` for ordinary voice turn-taking, so its
 * ABSENCE was previously invisible in these logs). The goal is to let a future reproduction
 * distinguish "no response was ever created", "a response was created but produced no output", and
 * "output was generated but playback never started" purely from this log stream, without needing
 * production Supabase rows.
 *
 * `sessionElapsedMs` (ms since this component mounted, i.e. the same origin sessionTimeline.ts's
 * `elapsed()` uses) is now a REQUIRED parameter, not an optional `extra` field some call sites
 * happened to include — every event in this stream is directly comparable to `realtime_turn_events`
 * timestamps without first converting from wall-clock `ts`.
 *
 * Never logs raw audio, transcript text, or any other sensitive content — only event types,
 * timestamps, durations, booleans, response/item ids, and non-content diagnostic values (e.g.
 * MediaTrackSettings, which contains only device capability flags/numbers, not audio).
 */
export type RealtimeDebugEvent =
  | "ai_response_created"
  | "ai_response_done"
  | "ai_audio_started"
  | "ai_audio_completed"
  | "ai_audio_cleared"
  | "speech_started"
  | "speech_stopped"
  | "speech_started_during_ai_audio"
  | "response_cancelled"
  | "user_transcription_completed"
  | "user_transcription_failed"
  | "mic_track_settings"
  // Added for the response-stall incident — see the module doc comment.
  | "response_create_sent"
  | "automatic_response_expected"
  | "first_output_audio_delta"
  | "output_audio_buffer_clear_sent"
  | "realtime_error"
  | "thinking_stall_detected";

export function logRealtimeDebugEvent(
  sessionId: string,
  event: RealtimeDebugEvent,
  sessionElapsedMs: number,
  extra?: Record<string, unknown>,
): void {
  console.debug(`[voice:realtime:debug] ${event}`, {
    sessionId,
    sessionElapsedMs,
    ts: new Date().toISOString(),
    ...extra,
  });
}
