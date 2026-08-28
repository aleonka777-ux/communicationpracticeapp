import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database, SemanticResponseRow, SemanticResponseTurnRow } from "@/lib/db/types";
import { listRealtimeDisfluencyCandidates, listRealtimePauseEvents, listRealtimeTurnEvents } from "@/lib/db/realtimeMetrics";
import { buildSemanticResponses } from "@/lib/semanticResponse/build";
import { mapRawRowsToGroupingEvidence } from "@/lib/semanticResponse/mapRawRows";
import type { SemanticResponse, SemanticResponseComputation } from "@/lib/semanticResponse/types";

/**
 * Phase 4B.1A persistence — same idempotent delete-then-insert-by-session_id pattern already
 * established for realtime_turn_events/realtime_pause_events/realtime_disfluency_candidates (see
 * src/lib/db/realtimeMetrics.ts). A recompute replaces this session's semantic_responses/
 * semantic_response_turns rows wholesale — see /docs/DECISIONS.md "Phase 4B.1A: Semantic Response
 * Foundation" for why no separate "grouping run" table is needed for this to stay correct.
 */

function logPersistenceFailure(context: string, sessionId: string, error: PostgrestError, rows?: unknown): void {
  console.error(
    `[semantic-response] ${context} failed`,
    JSON.stringify({ sessionId, code: error.code, message: error.message, details: error.details, hint: error.hint, rows }),
  );
}

function toSemanticResponseInsertRow(sessionId: string, r: SemanticResponse): Omit<SemanticResponseRow, "id" | "computed_at"> {
  return {
    session_id: sessionId,
    response_index: r.responseIndex,
    grouping_algorithm_version: r.groupingAlgorithmVersion,
    start_ms: r.startMs,
    end_ms: r.endMs,
    span_duration_ms: r.spanDurationMs,
    grouping_confidence: r.groupingConfidence,
    grouping_reasons: r.groupingReasons,
    preceding_boundary_decision: r.precedingBoundaryDecision,
    preceding_boundary_gap_ms: r.precedingBoundaryGapMs,
    preceding_ai_response_id: r.precedingAiResponseId,
    response_latency_ms: r.responseLatencyMs,
    transcript_coverage: r.transcriptCoverage,
    combined_transcript: r.combinedTranscript,
    word_count: r.wordCount,
    semantic_response_wpm: r.semanticResponseWpm,
    avg_relative_intensity: r.avgRelativeIntensity,
    peak_relative_intensity: r.peakRelativeIntensity,
    intensity_variability: r.intensityVariability,
    started_while_ai_speaking: r.startedWhileAiSpeaking,
    user_interrupted_ai: r.userInterruptedAi,
    was_interrupted_by_ai: r.wasInterruptedByAi,
  };
}

/**
 * Reads back the session's raw evidence (already persisted by /api/simulation/realtime/metrics),
 * runs the deterministic grouping/build pipeline, and replaces this session's semantic_responses/
 * semantic_response_turns rows wholesale. Safe to call more than once for the same session
 * (idempotent by construction: delete-then-insert, and the grouping/build pipeline is a pure
 * function of its input). Never mutates realtime_turn_events/realtime_pause_events/
 * realtime_disfluency_candidates — read-only against those tables.
 */
export async function computeAndPersistSemanticResponses(
  supabase: SupabaseClient<Database>,
  sessionId: string,
): Promise<SemanticResponseComputation> {
  const [turnEvents, pauseEvents, disfluencyCandidates] = await Promise.all([
    listRealtimeTurnEvents(supabase, sessionId),
    listRealtimePauseEvents(supabase, sessionId),
    listRealtimeDisfluencyCandidates(supabase, sessionId),
  ]);

  const evidence = mapRawRowsToGroupingEvidence(turnEvents, pauseEvents, disfluencyCandidates);
  const computation = buildSemanticResponses(evidence);

  for (const violation of computation.invariantViolations) {
    console.error(`[semantic-response] invariant violation for session ${sessionId}: ${violation}`);
  }

  const { error: deleteError } = await supabase.from("semantic_responses").delete().eq("session_id", sessionId);
  if (deleteError) {
    logPersistenceFailure("semantic_responses delete", sessionId, deleteError);
    throw deleteError;
  }

  if (computation.responses.length === 0) return computation;

  const responseRows = computation.responses.map((r) => toSemanticResponseInsertRow(sessionId, r));
  const { data: insertedResponses, error: insertResponsesError } = await supabase
    .from("semantic_responses")
    .insert(responseRows)
    .select("id, response_index");
  if (insertResponsesError) {
    logPersistenceFailure("semantic_responses insert", sessionId, insertResponsesError, responseRows);
    throw insertResponsesError;
  }

  const responseIdByIndex = new Map((insertedResponses ?? []).map((r) => [r.response_index, r.id]));
  const turnRows: Omit<SemanticResponseTurnRow, "id">[] = computation.responses.flatMap((r) => {
    const semanticResponseId = responseIdByIndex.get(r.responseIndex);
    if (!semanticResponseId) return [];
    return r.constituentTurns.map((t) => ({
      session_id: sessionId,
      semantic_response_id: semanticResponseId,
      realtime_item_id: t.itemId,
      turn_order_in_response: t.turnOrderInResponse,
      gap_before_ms: t.gapBeforeMs,
      gap_counts_as_meaningful_pause: t.gapCountsAsMeaningfulPause,
    }));
  });

  if (turnRows.length > 0) {
    const { error: insertTurnsError } = await supabase.from("semantic_response_turns").insert(turnRows);
    if (insertTurnsError) {
      logPersistenceFailure("semantic_response_turns insert", sessionId, insertTurnsError, turnRows);
      throw insertTurnsError;
    }
  }

  return computation;
}

export async function listSemanticResponses(supabase: SupabaseClient<Database>, sessionId: string): Promise<SemanticResponseRow[]> {
  const { data, error } = await supabase
    .from("semantic_responses")
    .select("*")
    .eq("session_id", sessionId)
    .order("response_index", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function listSemanticResponseTurns(supabase: SupabaseClient<Database>, sessionId: string): Promise<SemanticResponseTurnRow[]> {
  const { data, error } = await supabase
    .from("semantic_response_turns")
    .select("*")
    .eq("session_id", sessionId)
    .order("turn_order_in_response", { ascending: true });
  if (error) throw error;
  return data ?? [];
}
