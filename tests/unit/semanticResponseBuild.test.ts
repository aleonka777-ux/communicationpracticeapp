import { describe, expect, it } from "vitest";
import { buildSemanticResponses } from "@/lib/semanticResponse/build";
import { MIN_INTRA_PAUSE_MS } from "@/lib/realtime/speechDeliveryTracker";
import type {
  RawAiTurnInput,
  RawBargeInInput,
  RawOverlapInput,
  RawUserTurnInput,
  SemanticGroupingRawEvidence,
} from "@/lib/semanticResponse/types";

function turn(overrides: Partial<RawUserTurnInput> & { itemId: string; startMs: number; endMs: number }): RawUserTurnInput {
  return {
    classification: "confirmed",
    serverAudioStartMs: null,
    serverAudioEndMs: null,
    transcript: null,
    transcriptionFailed: false,
    audibleAiResponseIdAtStart: null,
    wordCount: null,
    avgRelativeIntensity: null,
    peakRelativeIntensity: null,
    intensityVariability: null,
    ...overrides,
  };
}

function evidence(overrides: Partial<SemanticGroupingRawEvidence>): SemanticGroupingRawEvidence {
  return { userTurns: [], aiTurns: [], bargeIns: [], overlaps: [], pauses: [], fillerCandidates: [], ...overrides };
}

describe("buildSemanticResponses — Phase 4B.1A (see /docs/DECISIONS.md)", () => {
  it("Case 7 — suspected noise is excluded entirely: never becomes, or blocks grouping of, a semantic response", () => {
    const result = buildSemanticResponses(
      evidence({
        userTurns: [
          turn({ itemId: "a", startMs: 0, endMs: 1000, transcript: "hello there" }),
          turn({ itemId: "noise", startMs: 1000.1, endMs: 1200, classification: "suspected_noise" }),
          turn({ itemId: "b", startMs: 1000.3, endMs: 2000, transcript: "still talking" }),
        ],
      }),
    );

    // The suspected_noise turn never appears as a constituent of any response...
    const allConstituentIds = result.responses.flatMap((r) => r.constituentTurns.map((t) => t.itemId));
    expect(allConstituentIds).not.toContain("noise");
    // ...and does not block a/b (adjacent once noise is filtered) from being evaluated as a
    // negligible-gap pair and merged.
    expect(result.responses).toHaveLength(1);
    expect(allConstituentIds).toEqual(["a", "b"]);
  });

  it("Case 8 — partial transcript coverage: grouped response with one missing transcript -> coverage partial, WPM null", () => {
    const result = buildSemanticResponses(
      evidence({
        userTurns: [
          turn({ itemId: "a", startMs: 0, endMs: 1000, transcript: "I think that" }),
          turn({ itemId: "b", startMs: 1000.5, endMs: 2000, transcript: null }), // never arrived — confirmed via duration fallback upstream
          turn({ itemId: "c", startMs: 2000.5, endMs: 3000, transcript: "makes sense" }),
        ],
      }),
    );

    expect(result.responses).toHaveLength(1);
    const response = result.responses[0];
    expect(response.constituentTurns.map((t) => t.itemId)).toEqual(["a", "b", "c"]);
    expect(response.transcriptCoverage).toBe("partial");
    expect(response.semanticResponseWpm).toBeNull();
    expect(response.combinedTranscript).toBeNull();
  });

  it("all constituent turns missing transcript -> coverage missing", () => {
    const result = buildSemanticResponses(
      evidence({
        userTurns: [
          turn({ itemId: "a", startMs: 0, endMs: 1000, transcript: null }),
          turn({ itemId: "b", startMs: 1000.5, endMs: 2000, transcript: null }),
        ],
      }),
    );

    expect(result.responses[0].transcriptCoverage).toBe("missing");
    expect(result.responses[0].semanticResponseWpm).toBeNull();
  });

  it("Case 9 — complete transcript coverage: combined transcript in chronological order, correct word count and WPM", () => {
    const result = buildSemanticResponses(
      evidence({
        userTurns: [
          turn({ itemId: "a", startMs: 0, endMs: 2000, transcript: "I really think" }),
          turn({ itemId: "b", startMs: 2000.05, endMs: 12000, transcript: "we should proceed carefully here" }),
        ],
      }),
    );

    const response = result.responses[0];
    expect(response.transcriptCoverage).toBe("complete");
    expect(response.combinedTranscript).toBe("I really think we should proceed carefully here");
    expect(response.wordCount).toBe(8);
    // span = 12000ms = 0.2 minutes; 8 words / 0.2min = 40 WPM.
    expect(response.semanticResponseWpm).toBeCloseTo(40, 5);
  });

  it("does not fabricate WPM for a complete-coverage response with fewer than MIN_WORDS_FOR_RATE words", () => {
    const result = buildSemanticResponses(
      evidence({ userTurns: [turn({ itemId: "a", startMs: 0, endMs: 1000, transcript: "Okay." })] }),
    );
    expect(result.responses[0].transcriptCoverage).toBe("complete");
    expect(result.responses[0].semanticResponseWpm).toBeNull();
  });

  it("Case 10 — bridge gaps: one below and one above the meaningful-pause threshold within the same response", () => {
    const smallGap = 50; // below MIN_INTRA_PAUSE_MS
    const largeGap = MIN_INTRA_PAUSE_MS + 100; // above it, still below the candidate ceiling
    const result = buildSemanticResponses(
      evidence({
        userTurns: [
          turn({ itemId: "a", startMs: 0, endMs: 1000 }),
          turn({ itemId: "b", startMs: 1000 + smallGap, endMs: 2000 }),
          turn({ itemId: "c", startMs: 2000 + largeGap, endMs: 3000 }),
        ],
        bargeIns: [
          // corroborate both boundaries so they merge deterministically regardless of gap size
          { atMs: 1000 + smallGap + 10, aiResponseId: null, context: "pre_playback", countsTowardInterruption: false } satisfies RawBargeInInput,
          { atMs: 2000 + largeGap + 10, aiResponseId: null, context: "pre_playback", countsTowardInterruption: false } satisfies RawBargeInInput,
        ],
      }),
    );

    expect(result.responses).toHaveLength(1);
    const [first, second, third] = result.responses[0].constituentTurns;
    expect(first.gapBeforeMs).toBeNull();
    expect(second.gapBeforeMs).toBe(smallGap);
    expect(second.gapCountsAsMeaningfulPause).toBe(false);
    expect(third.gapBeforeMs).toBe(largeGap);
    expect(third.gapCountsAsMeaningfulPause).toBe(true);
  });

  it("Case 11 — raw evidence immutability: building never mutates any input array/object", () => {
    const rawEvidence = evidence({
      userTurns: [
        turn({ itemId: "a", startMs: 0, endMs: 1000, transcript: "hello" }),
        turn({ itemId: "b", startMs: 1000.2, endMs: 2000, transcript: "world" }),
      ],
      aiTurns: [{ responseId: "r1", startMs: -500, endMs: -100 } satisfies RawAiTurnInput],
      overlaps: [{ userItemId: "a", aiResponseId: "r1" } satisfies RawOverlapInput],
    });
    Object.freeze(rawEvidence.userTurns);
    rawEvidence.userTurns.forEach(Object.freeze);
    Object.freeze(rawEvidence.aiTurns);
    Object.freeze(rawEvidence.overlaps);
    const snapshot = JSON.parse(JSON.stringify(rawEvidence));

    expect(() => buildSemanticResponses(rawEvidence)).not.toThrow();
    expect(JSON.parse(JSON.stringify(rawEvidence))).toEqual(snapshot);
  });

  it("Case 12 — idempotent rerun: running the same algorithm on the same input twice yields identical output", () => {
    const rawEvidence = evidence({
      userTurns: [
        turn({ itemId: "a", startMs: 0, endMs: 1000, transcript: "one two three" }),
        turn({ itemId: "b", startMs: 1000.3, endMs: 2000, transcript: "four five" }),
      ],
    });

    const first = buildSemanticResponses(rawEvidence);
    const second = buildSemanticResponses(rawEvidence);

    expect(second).toEqual(first);
  });

  it("every response is tagged with the current grouping algorithm version", () => {
    const result = buildSemanticResponses(evidence({ userTurns: [turn({ itemId: "a", startMs: 0, endMs: 1000 })] }));
    expect(result.responses[0].groupingAlgorithmVersion).toBe("semantic-v1-deterministic");
  });

  it("a singleton response (no merge) carries null confidence and a single_raw_turn reason", () => {
    const result = buildSemanticResponses(
      evidence({
        userTurns: [turn({ itemId: "a", startMs: 0, endMs: 1000 }), turn({ itemId: "b", startMs: 10000, endMs: 11000 })], // far apart, no evidence -> separate
      }),
    );
    expect(result.responses).toHaveLength(2);
    for (const response of result.responses) {
      expect(response.groupingConfidence).toBeNull();
      expect(response.groupingReasons).toEqual(["single_raw_turn"]);
    }
  });

  it("preserves an ambiguous boundary's decision/gap on the resulting (separate) response for future Phase 4B.1B use", () => {
    const result = buildSemanticResponses(
      evidence({
        userTurns: [turn({ itemId: "a", startMs: 0, endMs: 1000 }), turn({ itemId: "b", startMs: 1800, endMs: 2500 })], // 800ms, uncorroborated
      }),
    );
    expect(result.responses).toHaveLength(2);
    expect(result.responses[1].precedingBoundaryDecision).toBe("ambiguous");
    expect(result.responses[1].precedingBoundaryGapMs).toBe(800);
  });

  it("computes response latency via strict adjacency to a validly-preceding AI turn, never scanning further back", () => {
    const result = buildSemanticResponses(
      evidence({
        userTurns: [turn({ itemId: "a", startMs: 5000, endMs: 6000 })],
        aiTurns: [{ responseId: "resp_1", startMs: 3000, endMs: 4500 } satisfies RawAiTurnInput],
      }),
    );
    expect(result.responses[0].precedingAiResponseId).toBe("resp_1");
    expect(result.responses[0].responseLatencyMs).toBe(500);
  });

  it("leaves response latency null for an overlapping (non-adjacent) preceding AI turn", () => {
    const result = buildSemanticResponses(
      evidence({
        userTurns: [turn({ itemId: "a", startMs: 5000, endMs: 6000 })],
        aiTurns: [{ responseId: "resp_1", startMs: 3000, endMs: 5500 } satisfies RawAiTurnInput], // ends AFTER the user turn starts
      }),
    );
    expect(result.responses[0].precedingAiResponseId).toBeNull();
    expect(result.responses[0].responseLatencyMs).toBeNull();
  });

  it("derives interaction flags from existing raw evidence only", () => {
    const result = buildSemanticResponses(
      evidence({
        userTurns: [turn({ itemId: "a", startMs: 1000, endMs: 2000, audibleAiResponseIdAtStart: "resp_1" })],
        bargeIns: [{ atMs: 1500, aiResponseId: "resp_1", context: "audible", countsTowardInterruption: true } satisfies RawBargeInInput],
        overlaps: [{ userItemId: "a", aiResponseId: "resp_1" } satisfies RawOverlapInput],
      }),
    );
    const response = result.responses[0];
    expect(response.startedWhileAiSpeaking).toBe(true);
    expect(response.userInterruptedAi).toBe(true);
    expect(response.wasInterruptedByAi).toBe(true);
  });

  it("aggregates intensity via a duration-weighted mean (avg), exact max (peak), never a naive average of averages", () => {
    const result = buildSemanticResponses(
      evidence({
        userTurns: [
          turn({ itemId: "a", startMs: 0, endMs: 1000, avgRelativeIntensity: 0.1, peakRelativeIntensity: 0.3, intensityVariability: 0.05 }),
          turn({ itemId: "b", startMs: 1000, endMs: 4000, avgRelativeIntensity: 0.4, peakRelativeIntensity: 0.5, intensityVariability: 0.1 }),
        ],
      }),
    );
    const response = result.responses[0];
    // duration-weighted: (0.1*1000 + 0.4*3000) / 4000 = 1300/4000 = 0.325
    expect(response.avgRelativeIntensity).toBeCloseTo(0.325, 6);
    expect(response.peakRelativeIntensity).toBe(0.5);
    expect(response.intensityVariability).not.toBeNull();
  });

  it("returns no responses for an empty session", () => {
    expect(buildSemanticResponses(evidence({}))).toEqual({ responses: [], invariantViolations: [] });
  });
});
