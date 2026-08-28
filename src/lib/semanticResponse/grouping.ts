/**
 * Phase 4B.1A deterministic grouping algorithm — decides which chronologically-adjacent CONFIRMED
 * raw user turns belong to the same Semantic Response. Pure, synchronous, no I/O, no LLM, no
 * linguistic analysis (see the module doc comment in types.ts and /docs/DECISIONS.md "Phase 4B.1A:
 * Semantic Response Foundation" for the full design/audit this implements).
 *
 * Precision over recall: only a HIGH-confidence MERGE boundary is ever automatically merged. An
 * uncertain boundary is left SEPARATE (never guessed) but the decision + evidence are preserved on
 * the resulting response (`precedingBoundaryDecision`/`precedingBoundaryGapMs`) so a future
 * Phase 4B.1B linguistic pass can revisit it — see SemanticResponse's own doc comment.
 *
 * Inputs considered, and ONLY these (see the Phase 4B.1A spec's explicit "no linguistic semantics
 * yet" instruction):
 *  A. Whether an actual `ai_turn` (real playback, not a pre_playback-only cancellation) occurred
 *     between the two turns — a HARD boundary (always SEPARATE) regardless of any other evidence.
 *  B. The gap between the two turns, preferring the SERVER audio clock (serverAudioEndMs ->
 *     serverAudioStartMs, one self-consistent clock domain) when both turns have it, falling back
 *     to the CLIENT clock (endMs -> startMs) otherwise — this codebase's own established rule is to
 *     never mix the two clock domains in one measurement (see sessionTimeline.ts's own doc comment
 *     on overlap/latency), so a genuinely comparable gap always stays within one domain.
 *  C. Whether a `pre_playback` confirmed_barge_in is attributable to the SECOND turn (its `atMs`
 *     falls within that turn's own [startMs, endMs] span — the only way a barge-in can be attributed
 *     at all, since one can only fire while its triggering user turn is open; see
 *     sessionTimeline.ts's recordConfirmedBargeIn() doc comment).
 *
 * Two thresholds are reused from ALREADY-JUSTIFIED constants elsewhere in this codebase — neither is
 * invented for this module, and neither was chosen to make any specific production example merge:
 *  - MAX_CANDIDATE_GAP_MS reuses sessionTimeline.ts's own MIN_UNANSWERED_GAP_MS (2000ms). That
 *    constant already exists to distinguish "ordinary VAD-segmented continuation of one utterance"
 *    from "a genuine gap" for the unanswered-turn diagnostic — the exact same distinction this
 *    module needs for grouping eligibility. A gap at or above it is never a merge candidate.
 *  - NEGLIGIBLE_GAP_MS mirrors sessionTimeline.ts's own MIN_MEANINGFUL_OVERLAP_MS (10ms) reasoning,
 *    applied to gaps instead of overlaps: below this, two independently-timestamped client events
 *    are indistinguishable from ordinary JS event-processing-order jitter, not a real, perceptible
 *    interruption in speech — so a gap this small is treated as high-confidence continuation on its
 *    own, without needing barge-in corroboration.
 *
 * Gap duration alone, between these two bounds, is NOT sufficient evidence to merge (per the spec's
 * explicit instruction) — it only becomes high-confidence together with the pre_playback signal
 * (rule C). Without that corroboration, a sub-ceiling gap is left AMBIGUOUS, not merged.
 */

import { MIN_UNANSWERED_GAP_MS } from "@/lib/realtime/sessionTimeline";
import type {
  BoundaryDecision,
  BoundaryEvaluation,
  RawAiTurnInput,
  RawBargeInInput,
  RawUserTurnInput,
  SemanticGroupingRawEvidence,
} from "@/lib/semanticResponse/types";

export const GROUPING_ALGORITHM_VERSION = "semantic-v1-deterministic";

/** See the module doc comment — reused, not invented. */
export const MAX_CANDIDATE_GAP_MS = MIN_UNANSWERED_GAP_MS;

/** See the module doc comment — mirrors sessionTimeline.ts's MIN_MEANINGFUL_OVERLAP_MS reasoning,
 *  applied to gaps instead of overlaps. */
export const NEGLIGIBLE_GAP_MS = 10;

function intervalsOverlap(a: { startMs: number; endMs: number }, b: { startMs: number; endMs: number }): boolean {
  return Math.max(a.startMs, b.startMs) < Math.min(a.endMs, b.endMs);
}

/**
 * Attributes a confirmed_barge_in event to whichever CONFIRMED user turn was open when it fired —
 * the only sound attribution rule available, since the raw event itself carries no item_id (see the
 * module doc comment). Returns null if no confirmed turn's span contains atMs (should not normally
 * happen, per sessionTimeline.ts's own invariant that a barge-in only ever fires while a turn is
 * open — defensive only).
 */
export function attributeBargeInToTurn(atMs: number, confirmedTurns: RawUserTurnInput[]): RawUserTurnInput | null {
  return confirmedTurns.find((t) => atMs >= t.startMs && atMs <= t.endMs) ?? null;
}

/** True iff any AI turn interval intersects the (turnA.endMs, turnB.startMs) gap window — a HARD
 *  boundary per rule A. Uses interval overlap against a zero-or-positive-width gap window so an AI
 *  turn that started exactly at turnA's end or exactly at turnB's start still counts. */
function hasActualAiTurnBetween(turnA: RawUserTurnInput, turnB: RawUserTurnInput, aiTurns: RawAiTurnInput[]): boolean {
  const gapWindow = { startMs: turnA.endMs, endMs: Math.max(turnA.endMs, turnB.startMs) };
  return aiTurns.some((ai) => intervalsOverlap(ai, gapWindow));
}

/** Computes the gap between two adjacent confirmed turns, preferring the server audio clock (one
 *  self-consistent domain) when both sides have it — see the module doc comment, rule B. */
function computeGap(turnA: RawUserTurnInput, turnB: RawUserTurnInput): { gapMs: number; gapSource: "server_audio_clock" | "client_clock" } {
  if (turnA.serverAudioEndMs !== null && turnB.serverAudioStartMs !== null) {
    return { gapMs: turnB.serverAudioStartMs - turnA.serverAudioEndMs, gapSource: "server_audio_clock" };
  }
  return { gapMs: turnB.startMs - turnA.endMs, gapSource: "client_clock" };
}

/**
 * Evaluates the boundary between two chronologically-adjacent CONFIRMED user turns. Pure — never
 * mutates its inputs. `bargeIns` should be the full session's confirmed_barge_in list; attribution
 * to turnB is computed internally.
 */
export function evaluateBoundary(
  turnA: RawUserTurnInput,
  turnB: RawUserTurnInput,
  aiTurns: RawAiTurnInput[],
  bargeIns: RawBargeInInput[],
): BoundaryEvaluation {
  const { gapMs: rawGapMs, gapSource } = computeGap(turnA, turnB);
  // Clamp only for evidence evaluation below — a meaningfully negative gap (overlapping turns) is
  // an upstream invariant violation the caller surfaces separately, never silently hidden here.
  const gapMs = Math.max(0, rawGapMs);

  // Rule A — hard boundary, checked first, overrides every other signal.
  if (hasActualAiTurnBetween(turnA, turnB, aiTurns)) {
    return { decision: "separate", reasons: ["actual_ai_turn_between"], gapMs, gapSource };
  }

  const reasons = ["adjacent_confirmed_user_turns", "no_audible_ai_turn_between"];

  if (gapMs >= MAX_CANDIDATE_GAP_MS) {
    return { decision: "separate", reasons: [...reasons, "gap_at_or_above_candidate_ceiling"], gapMs, gapSource };
  }

  if (gapMs <= NEGLIGIBLE_GAP_MS) {
    return { decision: "merge", reasons: [...reasons, "negligible_gap"], gapMs, gapSource };
  }

  // Rule C — pre_playback cancellation attributable to the SECOND fragment.
  const precedingPrePlaybackOnTurnB = bargeIns.some((b) => {
    if (b.context !== "pre_playback") return false;
    return b.atMs >= turnB.startMs && b.atMs <= turnB.endMs;
  });
  if (precedingPrePlaybackOnTurnB) {
    return { decision: "merge", reasons: [...reasons, "short_gap", "pre_playback_cancellation_on_second_fragment"], gapMs, gapSource };
  }

  return { decision: "ambiguous", reasons: [...reasons, "short_gap_uncorroborated"], gapMs, gapSource };
}

export interface GroupedRun {
  turns: RawUserTurnInput[];
  /** Boundary decision immediately BEFORE this run's first turn — null for the session's first run. */
  precedingBoundary: { decision: BoundaryDecision; gapMs: number } | null;
  /** Evaluations for every internal boundary within this run (empty for a singleton run) — always
   *  "merge", by construction (only merge boundaries ever join a run), preserved for
   *  grouping_reasons / debugging. */
  internalBoundaries: BoundaryEvaluation[];
}

/**
 * Groups a session's CONFIRMED user turns (chronologically ordered) into runs via a single
 * left-to-right pass: a run extends across a boundary iff evaluateBoundary() returns "merge";
 * "separate" and "ambiguous" both end the current run (V1 never auto-merges an ambiguous boundary —
 * see the module doc comment). suspected_noise turns must be filtered out by the caller before this
 * runs (see buildSemanticResponses(), which does so) — this function assumes every turn passed in
 * is already `classification === "confirmed"`.
 */
export function groupConfirmedTurnsIntoRuns(
  confirmedTurns: RawUserTurnInput[],
  aiTurns: RawAiTurnInput[],
  bargeIns: RawBargeInInput[],
): GroupedRun[] {
  if (confirmedTurns.length === 0) return [];

  const runs: GroupedRun[] = [{ turns: [confirmedTurns[0]], precedingBoundary: null, internalBoundaries: [] }];

  for (let i = 1; i < confirmedTurns.length; i++) {
    const prevTurn = confirmedTurns[i - 1];
    const turn = confirmedTurns[i];
    const evaluation = evaluateBoundary(prevTurn, turn, aiTurns, bargeIns);

    if (evaluation.decision === "merge") {
      const currentRun = runs[runs.length - 1];
      currentRun.turns.push(turn);
      currentRun.internalBoundaries.push(evaluation);
    } else {
      runs.push({
        turns: [turn],
        precedingBoundary: { decision: evaluation.decision, gapMs: evaluation.gapMs },
        internalBoundaries: [],
      });
    }
  }

  return runs;
}

/** Convenience re-export so callers only need one import for the whole raw-evidence shape. */
export type { SemanticGroupingRawEvidence };
