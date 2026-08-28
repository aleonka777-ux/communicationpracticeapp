/**
 * Maps already-persisted raw rows (realtime_turn_events / realtime_pause_events /
 * realtime_disfluency_candidates) into the SemanticGroupingRawEvidence shape the grouping/build
 * pipeline consumes. This is the ONLY adapter — both the live post-session compute (triggered from
 * /api/simulation/realtime/metrics right after raw rows are persisted) and any future manual/
 * on-demand recompute for a production session go through this same mapping, so "recompute from
 * unchanged raw evidence" always means the exact same code path. See
 * /docs/DECISIONS.md "Phase 4B.1A: Semantic Response Foundation".
 */

import type { RealtimeDisfluencyCandidateRow, RealtimePauseEventRow, RealtimeTurnEventRow } from "@/lib/db/types";
import type { SemanticGroupingRawEvidence } from "@/lib/semanticResponse/types";

export function mapRawRowsToGroupingEvidence(
  turnEvents: RealtimeTurnEventRow[],
  pauseEvents: RealtimePauseEventRow[],
  disfluencyCandidates: RealtimeDisfluencyCandidateRow[],
): SemanticGroupingRawEvidence {
  const userTurns = turnEvents
    .filter((r) => r.kind === "user_turn" && r.realtime_item_id !== null)
    .map((r) => ({
      itemId: r.realtime_item_id as string,
      classification: (r.user_turn_classification ?? "suspected_noise") as "confirmed" | "suspected_noise",
      startMs: r.start_ms,
      endMs: r.end_ms ?? r.start_ms,
      serverAudioStartMs: r.server_audio_start_ms,
      serverAudioEndMs: r.server_audio_end_ms,
      transcript: r.transcript,
      transcriptionFailed: r.transcription_failed ?? false,
      audibleAiResponseIdAtStart: r.audible_ai_response_id_at_start,
      wordCount: r.word_count,
      avgRelativeIntensity: r.avg_relative_intensity,
      peakRelativeIntensity: r.peak_relative_intensity,
      intensityVariability: r.intensity_variability,
    }));

  const aiTurns = turnEvents
    .filter((r) => r.kind === "ai_turn" && r.realtime_response_id !== null)
    .map((r) => ({ responseId: r.realtime_response_id as string, startMs: r.start_ms, endMs: r.end_ms ?? r.start_ms }));

  const bargeIns = turnEvents
    .filter((r) => r.kind === "confirmed_barge_in")
    .map((r) => ({
      atMs: r.start_ms,
      aiResponseId: r.realtime_response_id,
      context: (r.barge_in_context ?? "pre_playback") as "audible" | "pre_playback",
      countsTowardInterruption: r.counts_toward_interruption ?? false,
    }));

  const overlaps = turnEvents
    .filter((r) => r.kind === "overlap" && r.realtime_item_id !== null && r.realtime_response_id !== null)
    .map((r) => ({ userItemId: r.realtime_item_id as string, aiResponseId: r.realtime_response_id as string }));

  const pauses = pauseEvents.map((p) => ({ itemId: p.realtime_item_id, startMs: p.start_ms, durationMs: p.duration_ms, positionRatio: p.position_ratio }));

  const fillerCandidates = disfluencyCandidates.map((c) => ({
    itemId: c.realtime_item_id,
    category: c.category,
    phrase: c.phrase,
    approxSessionMs: c.approx_session_ms,
  }));

  return { userTurns, aiTurns, bargeIns, overlaps, pauses, fillerCandidates };
}
