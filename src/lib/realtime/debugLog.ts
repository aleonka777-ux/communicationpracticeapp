/**
 * Structured development/debug logging for live Realtime conversation events — separate from
 * finalizationLog.ts (which covers session-ending, not moment-to-moment conversation events).
 * Added to diagnose false-interruption reports (acoustic echo triggering a false
 * `speech_started` while the AI is talking): these logs are what let a developer tell apart a
 * real user barge-in, speaker echo, a short noise blip, and an actual spoken utterance, without
 * ever needing the raw audio itself. console.debug (not .info/.error) deliberately, since this is
 * verbose per-turn diagnostic detail, not a lifecycle milestone or a failure.
 *
 * Never logs raw audio, transcript text, or any other sensitive content — only event types,
 * timestamps, durations, booleans, and non-content diagnostic values (e.g. MediaTrackSettings,
 * which contains only device capability flags/numbers, not audio).
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
  | "mic_track_settings";

export function logRealtimeDebugEvent(sessionId: string, event: RealtimeDebugEvent, extra?: Record<string, unknown>): void {
  console.debug(`[voice:realtime:debug] ${event}`, {
    sessionId,
    ts: new Date().toISOString(),
    ...extra,
  });
}
