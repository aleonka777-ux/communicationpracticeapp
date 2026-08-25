/**
 * Structured client-side logging for the Realtime session finalization lifecycle (timer/End
 * Practice → evaluation → navigation to feedback). Added after production evidence of a session
 * that completed evaluation successfully (/api/practice/end returned 200) but left the browser
 * stuck on "Wrapping up…" indefinitely — with these stage markers, a repeat can be diagnosed from
 * browser console/telemetry alone: which stage was last logged tells you exactly where it stalled.
 * Deliberately console-only (no transcript text, no PII) — see CLAUDE.md "Transcripts are
 * sensitive."
 */
export type FinalizationStage =
  | "timer_expired"
  | "end_practice_requested"
  | "waiting_for_current_exchange_to_finish"
  | "waiting_for_final_turn_transcription"
  | "realtime_closed"
  | "transcript_flushed"
  | "practice_end_started"
  | "practice_end_succeeded"
  | "practice_end_failed"
  | "navigation_started"
  | "navigation_completed"
  | "navigation_stalled";

export function logFinalizationStage(sessionId: string, stage: FinalizationStage, extra?: Record<string, unknown>): void {
  console.info(`[voice:realtime:finalize] ${stage}`, {
    sessionId,
    ts: new Date().toISOString(),
    ...extra,
  });
}
