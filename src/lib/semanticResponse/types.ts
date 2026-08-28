/**
 * Shared types for the Semantic Response layer (Phase 4B.1A) — the middle layer between raw
 * Realtime/VAD evidence (src/lib/realtime/*, realtime_turn_events/realtime_pause_events/
 * realtime_disfluency_candidates) and future communication interpretation (not built here). See
 * /docs/DECISIONS.md "Phase 4B.1A: Semantic Response Foundation" for the full design/audit.
 *
 * A Semantic Response is one or more adjacent CONFIRMED raw user turns that deterministic
 * interaction/timing evidence indicates were one continuous human response, mechanically split by
 * server VAD. This layer NEVER rewrites, deletes, merges, or mutates raw evidence — every type here
 * is either an input read verbatim from already-persisted raw rows, or a derived/recomputable
 * output.
 */

export type RawUserTurnClassification = "confirmed" | "suspected_noise";
export type RawBargeInContext = "audible" | "pre_playback";

/** One raw user turn, exactly as persisted in realtime_turn_events (kind = 'user_turn') — the
 *  ONLY fields the grouping/build algorithms need, decoupled from the DB row shape so the same
 *  logic can run against either a freshly-read DB row or (in principle) an in-memory payload. */
export interface RawUserTurnInput {
  itemId: string;
  classification: RawUserTurnClassification;
  startMs: number;
  endMs: number;
  serverAudioStartMs: number | null;
  serverAudioEndMs: number | null;
  transcript: string | null;
  transcriptionFailed: boolean;
  audibleAiResponseIdAtStart: string | null;
  wordCount: number | null;
  avgRelativeIntensity: number | null;
  peakRelativeIntensity: number | null;
  intensityVariability: number | null;
}

/** One raw AI turn (kind = 'ai_turn') — only what boundary/latency evaluation needs. */
export interface RawAiTurnInput {
  responseId: string;
  startMs: number;
  endMs: number;
}

/** One raw confirmed_barge_in event — only what boundary evaluation and the interaction-flag
 *  derivation need. Note this raw event does NOT itself carry which user turn triggered it (see
 *  the audit in /docs/DECISIONS.md) — attribution is by timestamp-containment, computed by
 *  grouping.ts's attributeBargeInToTurn(). */
export interface RawBargeInInput {
  atMs: number;
  aiResponseId: string | null;
  context: RawBargeInContext;
  countsTowardInterruption: boolean;
}

/** One raw overlap interval (kind = 'overlap') — only what the was_interrupted_by_ai flag needs. */
export interface RawOverlapInput {
  userItemId: string;
  aiResponseId: string;
}

/** One raw intra-utterance pause (realtime_pause_events) — only what pause-evidence lookup needs. */
export interface RawPauseInput {
  itemId: string;
  startMs: number;
  durationMs: number;
  positionRatio: number;
}

/** One raw filler/disfluency candidate (realtime_disfluency_candidates) — only what the
 *  per-response candidate lookup needs. */
export interface RawFillerCandidateInput {
  itemId: string;
  category: "vocal_disfluency_candidate" | "lexical_discourse_candidate" | "repetition_candidate";
  phrase: string;
  approxSessionMs: number | null;
}

/** Full raw-evidence bundle for one session, as read back from already-persisted rows. This is the
 *  ONLY input the grouping/build pipeline takes — never raw audio, never a live event stream. */
export interface SemanticGroupingRawEvidence {
  userTurns: RawUserTurnInput[];
  aiTurns: RawAiTurnInput[];
  bargeIns: RawBargeInInput[];
  overlaps: RawOverlapInput[];
  pauses: RawPauseInput[];
  fillerCandidates: RawFillerCandidateInput[];
}

export type BoundaryDecision = "merge" | "separate" | "ambiguous";

/** Evaluation of the boundary between two chronologically-adjacent CONFIRMED raw user turns. Pure
 *  evidence + decision — never mutates either turn. */
export interface BoundaryEvaluation {
  decision: BoundaryDecision;
  reasons: string[];
  gapMs: number;
  gapSource: "server_audio_clock" | "client_clock";
}

/** One constituent turn's position + bridge-gap evidence within a grouped Semantic Response. */
export interface SemanticResponseTurnMembership {
  itemId: string;
  turnOrderInResponse: number;
  gapBeforeMs: number | null;
  gapCountsAsMeaningfulPause: boolean | null;
}

/** Full computed Semantic Response — everything section 10 of the Phase 4B.1A spec asks to make
 *  obtainable, before persistence-shape mapping. */
export interface SemanticResponse {
  responseIndex: number;
  groupingAlgorithmVersion: string;
  startMs: number;
  endMs: number;
  spanDurationMs: number;
  constituentTurns: SemanticResponseTurnMembership[];
  groupingConfidence: "high" | null;
  groupingReasons: string[];
  precedingBoundaryDecision: BoundaryDecision | null;
  precedingBoundaryGapMs: number | null;
  precedingAiResponseId: string | null;
  responseLatencyMs: number | null;
  transcriptCoverage: "complete" | "partial" | "missing";
  combinedTranscript: string | null;
  wordCount: number | null;
  semanticResponseWpm: number | null;
  avgRelativeIntensity: number | null;
  peakRelativeIntensity: number | null;
  intensityVariability: number | null;
  startedWhileAiSpeaking: boolean | null;
  userInterruptedAi: boolean | null;
  wasInterruptedByAi: boolean | null;
}

export interface SemanticResponseComputation {
  responses: SemanticResponse[];
  /** Diagnostic only, mirroring sessionTimeline.ts's own invariantViolations pattern — never used
   *  to clamp/reject data, only to surface an unexpected input shape loudly. */
  invariantViolations: string[];
}
