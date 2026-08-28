/**
 * Phase 4B.1A — builds full SemanticResponse records from grouped runs of raw user turns plus the
 * session's other raw evidence (AI turns, confirmed barge-ins, overlaps, pauses, filler candidates).
 * Pure, synchronous. See /docs/DECISIONS.md "Phase 4B.1A: Semantic Response Foundation".
 *
 * Nothing here mutates any raw input — every SemanticResponse is a freshly-derived object.
 */

import { countWords, MIN_WORDS_FOR_RATE } from "@/lib/realtime/sessionTimeline";
import { MIN_INTRA_PAUSE_MS } from "@/lib/realtime/speechDeliveryTracker";
import { GROUPING_ALGORITHM_VERSION, groupConfirmedTurnsIntoRuns, type GroupedRun } from "@/lib/semanticResponse/grouping";
import type {
  RawAiTurnInput,
  RawUserTurnInput,
  SemanticGroupingRawEvidence,
  SemanticResponse,
  SemanticResponseComputation,
  SemanticResponseTurnMembership,
} from "@/lib/semanticResponse/types";

function attributeBargeInToTurn(atMs: number, confirmedTurns: RawUserTurnInput[]): RawUserTurnInput | null {
  return confirmedTurns.find((t) => atMs >= t.startMs && atMs <= t.endMs) ?? null;
}

/**
 * Same merged, strictly-adjacent timeline walk as sessionTimeline.ts's own response-latency fix
 * (see its doc comment's "Response-latency pairing: conversational adjacency, not
 * nearest-preceding-turn" section) — recomputed here from raw evidence so a Semantic Response's
 * latency uses IDENTICAL semantics, never scanning further back/forward, never reassigning a stale
 * AI turn to an unrelated later user turn.
 */
function findPrecedingAiTurn(
  firstTurn: RawUserTurnInput,
  confirmedTurns: RawUserTurnInput[],
  aiTurns: RawAiTurnInput[],
): { responseId: string; endMs: number } | null {
  type MergedEntry = { kind: "ai"; startMs: number; endMs: number; responseId: string } | { kind: "user"; startMs: number; endMs: number; itemId: string };
  const merged: MergedEntry[] = [
    ...aiTurns.map((ai): MergedEntry => ({ kind: "ai", startMs: ai.startMs, endMs: ai.endMs, responseId: ai.responseId })),
    ...confirmedTurns.map((u): MergedEntry => ({ kind: "user", startMs: u.startMs, endMs: u.endMs, itemId: u.itemId })),
  ].sort((a, b) => a.startMs - b.startMs);

  const index = merged.findIndex((e) => e.kind === "user" && e.itemId === firstTurn.itemId);
  if (index <= 0) return null;
  const prev = merged[index - 1];
  if (prev.kind !== "ai") return null;
  if (firstTurn.startMs < prev.endMs) return null; // overlapping adjacency never produces a latency value
  return { responseId: prev.responseId, endMs: prev.endMs };
}

/** Weighted response-level intensity aggregation — see the module doc comment's formula note.
 *  Weighted by each constituent turn's own durationMs (a proportional proxy for sample count: the
 *  live mic-energy tracker samples at a fixed ~20Hz, per speechDeliveryTracker.ts, so duration and
 *  sample count are approximately proportional; the true per-turn sample count is not persisted to
 *  realtime_turn_events, so this is the best available weight). avgRelativeIntensity is an exact
 *  duration-weighted mean; peakRelativeIntensity is an exact max (never averaged — a peak combines
 *  correctly only via max); intensityVariability is an APPROXIMATE pooled variance (law of total
 *  variance: pooled_var = sum(w_i * (var_i + (mean_i - grand_mean)^2)) / sum(w_i)) — approximate
 *  specifically because it uses duration as a substitute for the unavailable true sample-count
 *  weight, not because the combination formula itself is unsound. */
function aggregateIntensity(
  turns: RawUserTurnInput[],
  durationByItemId: Map<string, number>,
): { avg: number | null; peak: number | null; variability: number | null } {
  const withIntensity = turns.filter((t) => t.avgRelativeIntensity !== null && durationByItemId.has(t.itemId) && (durationByItemId.get(t.itemId) as number) > 0);
  if (withIntensity.length === 0) return { avg: null, peak: null, variability: null };

  const totalWeight = withIntensity.reduce((sum, t) => sum + (durationByItemId.get(t.itemId) as number), 0);
  const grandMean = withIntensity.reduce((sum, t) => sum + (t.avgRelativeIntensity as number) * (durationByItemId.get(t.itemId) as number), 0) / totalWeight;

  const peaks = turns.map((t) => t.peakRelativeIntensity).filter((p): p is number => p !== null);
  const peak = peaks.length > 0 ? Math.max(...peaks) : null;

  const withVariability = withIntensity.filter((t) => t.intensityVariability !== null);
  let variability: number | null = null;
  if (withVariability.length > 0) {
    const varianceWeight = withVariability.reduce((sum, t) => sum + (durationByItemId.get(t.itemId) as number), 0);
    const pooledVariance =
      withVariability.reduce((sum, t) => {
        const w = durationByItemId.get(t.itemId) as number;
        const varI = (t.intensityVariability as number) ** 2;
        const meanI = t.avgRelativeIntensity as number;
        return sum + w * (varI + (meanI - grandMean) ** 2);
      }, 0) / varianceWeight;
    variability = Math.sqrt(pooledVariance);
  }

  return { avg: grandMean, peak, variability };
}

function buildResponseFromRun(
  run: GroupedRun,
  responseIndex: number,
  evidence: SemanticGroupingRawEvidence,
  confirmedTurns: RawUserTurnInput[],
): SemanticResponse {
  const { turns } = run;
  const firstTurn = turns[0];
  const lastTurn = turns[turns.length - 1];
  const startMs = firstTurn.startMs;
  const endMs = lastTurn.endMs;

  // Constituent-turn membership + bridge-gap evidence (section 14/21).
  const constituentTurns: SemanticResponseTurnMembership[] = turns.map((t, i) => {
    if (i === 0) {
      return { itemId: t.itemId, turnOrderInResponse: i, gapBeforeMs: null, gapCountsAsMeaningfulPause: null };
    }
    const gapBeforeMs = run.internalBoundaries[i - 1].gapMs;
    return {
      itemId: t.itemId,
      turnOrderInResponse: i,
      gapBeforeMs,
      gapCountsAsMeaningfulPause: gapBeforeMs >= MIN_INTRA_PAUSE_MS,
    };
  });

  // Grouping confidence/reasons (sections 3, 8).
  const groupingConfidence: "high" | null = turns.length > 1 ? "high" : null;
  const groupingReasons =
    turns.length > 1 ? Array.from(new Set(run.internalBoundaries.flatMap((b) => b.reasons))) : ["single_raw_turn"];

  // Transcript coverage + combined transcript + WPM (sections 11-13). A CONFIRMED turn can still
  // have no usable transcript (see sessionTimeline.ts's classification rule 4/rule 1 — duration or
  // barge-in confirmation, independent of transcript state); "has transcript" means non-null AND
  // non-empty after trimming.
  const transcripts = turns.map((t) => (t.transcript !== null && t.transcript.trim().length > 0 ? t.transcript.trim() : null));
  const turnsWithTranscript = transcripts.filter((t): t is string => t !== null).length;
  const transcriptCoverage: "complete" | "partial" | "missing" =
    turnsWithTranscript === turns.length ? "complete" : turnsWithTranscript === 0 ? "missing" : "partial";

  let combinedTranscript: string | null = null;
  let wordCount: number | null = null;
  let semanticResponseWpm: number | null = null;
  if (transcriptCoverage === "complete") {
    combinedTranscript = transcripts.filter((t): t is string => t !== null).join(" ");
    wordCount = countWords(combinedTranscript);
    const spanDurationMs = endMs - startMs;
    semanticResponseWpm = wordCount >= MIN_WORDS_FOR_RATE && spanDurationMs > 0 ? wordCount / (spanDurationMs / 60000) : null;
  }

  // Response latency (section 17) — strict adjacency, reusing sessionTimeline.ts's own semantics.
  const precedingAiTurn = findPrecedingAiTurn(firstTurn, confirmedTurns, evidence.aiTurns);
  const precedingAiResponseId = precedingAiTurn?.responseId ?? null;
  const responseLatencyMs = precedingAiTurn ? firstTurn.startMs - precedingAiTurn.endMs : null;

  // Intensity aggregation (section 16).
  const durationByItemId = new Map(turns.map((t) => [t.itemId, t.endMs - t.startMs]));
  const intensity = aggregateIntensity(turns, durationByItemId);

  // Interaction flags — evidence only (section 18).
  const startedWhileAiSpeaking = firstTurn.audibleAiResponseIdAtStart !== null;
  const userInterruptedAi = evidence.bargeIns.some((b) => {
    if (b.context !== "audible") return false;
    const attributed = attributeBargeInToTurn(b.atMs, confirmedTurns);
    return attributed !== null && turns.some((t) => t.itemId === attributed.itemId);
  });
  const wasInterruptedByAi = evidence.overlaps.some((o) => turns.some((t) => t.itemId === o.userItemId));

  return {
    responseIndex,
    groupingAlgorithmVersion: GROUPING_ALGORITHM_VERSION,
    startMs,
    endMs,
    spanDurationMs: endMs - startMs,
    constituentTurns,
    groupingConfidence,
    groupingReasons,
    precedingBoundaryDecision: run.precedingBoundary?.decision ?? null,
    precedingBoundaryGapMs: run.precedingBoundary?.gapMs ?? null,
    precedingAiResponseId,
    responseLatencyMs,
    transcriptCoverage,
    combinedTranscript,
    wordCount,
    semanticResponseWpm,
    avgRelativeIntensity: intensity.avg,
    peakRelativeIntensity: intensity.peak,
    intensityVariability: intensity.variability,
    startedWhileAiSpeaking,
    userInterruptedAi,
    wasInterruptedByAi,
  };
}

/**
 * Full Phase 4B.1A pipeline: filters to confirmed turns only (section 5 — suspected_noise, empty
 * VAD blips, and invalid events never become or block a Semantic Response), groups them
 * deterministically, and builds the final SemanticResponse records. Deterministic and idempotent:
 * calling this twice on the same input always produces the same output (see tests/unit/
 * semanticResponseBuild.test.ts's idempotent-rerun case).
 */
export function buildSemanticResponses(evidence: SemanticGroupingRawEvidence): SemanticResponseComputation {
  const invariantViolations: string[] = [];

  const confirmedTurns = evidence.userTurns
    .filter((t) => t.classification === "confirmed")
    .sort((a, b) => a.startMs - b.startMs);

  for (let i = 0; i < confirmedTurns.length; i++) {
    for (let j = i + 1; j < confirmedTurns.length; j++) {
      if (Math.max(confirmedTurns[i].startMs, confirmedTurns[j].startMs) < Math.min(confirmedTurns[i].endMs, confirmedTurns[j].endMs)) {
        invariantViolations.push(
          `Confirmed user turns ${confirmedTurns[i].itemId} and ${confirmedTurns[j].itemId} have overlapping intervals — grouping assumes non-overlapping confirmed turns (see sessionTimeline.ts's own validateSessionTimelineInvariants()).`,
        );
      }
    }
  }

  const runs = groupConfirmedTurnsIntoRuns(confirmedTurns, evidence.aiTurns, evidence.bargeIns);
  const responses = runs.map((run, i) => buildResponseFromRun(run, i + 1, evidence, confirmedTurns));

  return { responses, invariantViolations };
}
