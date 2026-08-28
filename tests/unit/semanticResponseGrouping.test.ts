import { describe, expect, it } from "vitest";
import {
  attributeBargeInToTurn,
  evaluateBoundary,
  groupConfirmedTurnsIntoRuns,
  MAX_CANDIDATE_GAP_MS,
  NEGLIGIBLE_GAP_MS,
} from "@/lib/semanticResponse/grouping";
import type { RawAiTurnInput, RawBargeInInput, RawUserTurnInput } from "@/lib/semanticResponse/types";

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

function aiTurn(overrides: Partial<RawAiTurnInput> & { responseId: string; startMs: number; endMs: number }): RawAiTurnInput {
  return { ...overrides };
}

function bargeIn(overrides: Partial<RawBargeInInput> & { atMs: number; context: "audible" | "pre_playback" }): RawBargeInInput {
  return { aiResponseId: null, countsTowardInterruption: false, ...overrides };
}

describe("evaluateBoundary — Phase 4B.1A deterministic grouping (see /docs/DECISIONS.md)", () => {
  it("Case 1 — known production-like VAD split: short gap + pre_playback on the second fragment -> merge, high confidence", () => {
    const u4 = turn({ itemId: "u4", startMs: 83257.3, endMs: 88971.9 });
    const u5 = turn({ itemId: "u5", startMs: 89030.3, endMs: 92605.2 });
    const bargeIns = [bargeIn({ atMs: 89293.4, context: "pre_playback" })]; // falls within u5's own span

    const result = evaluateBoundary(u4, u5, [], bargeIns);

    expect(result.decision).toBe("merge");
    expect(result.reasons).toContain("pre_playback_cancellation_on_second_fragment");
    expect(result.reasons).toContain("no_audible_ai_turn_between");
  });

  it("Case 2 — second continuation: same pattern repeats -> same treatment, independent of the first boundary", () => {
    const u5 = turn({ itemId: "u5", startMs: 89030.3, endMs: 92605.2 });
    const u6 = turn({ itemId: "u6", startMs: 92959.8, endMs: 110850.2 });
    const bargeIns = [bargeIn({ atMs: 93211.3, context: "pre_playback" })]; // falls within u6's own span

    const result = evaluateBoundary(u5, u6, [], bargeIns);

    expect(result.decision).toBe("merge");
    expect(result.reasons).toContain("pre_playback_cancellation_on_second_fragment");
  });

  it("Case 3 — near-zero raw split: essentially zero positive gap, no AI turn between, NO pre_playback needed -> high-confidence merge", () => {
    const a = turn({ itemId: "a", startMs: 1000, endMs: 2000 });
    const b = turn({ itemId: "b", startMs: 2000.4, endMs: 3000 }); // 0.4ms gap — well under NEGLIGIBLE_GAP_MS

    const result = evaluateBoundary(a, b, [], []);

    expect(result.decision).toBe("merge");
    expect(result.reasons).toContain("negligible_gap");
    expect(result.gapMs).toBeLessThanOrEqual(NEGLIGIBLE_GAP_MS);
  });

  it("Case 4 — actual AI turn between: hard boundary, SEPARATE regardless of small surrounding gaps or pre_playback evidence", () => {
    const a = turn({ itemId: "a", startMs: 1000, endMs: 2000 });
    const b = turn({ itemId: "b", startMs: 2005, endMs: 3000 }); // tiny 5ms gap
    const ai = [aiTurn({ responseId: "resp_1", startMs: 2001, endMs: 2004 })]; // a real AI turn squeezed into the gap
    // Even a pre_playback event on b must not override the hard boundary.
    const bargeIns = [bargeIn({ atMs: 2500, context: "pre_playback" })];

    const result = evaluateBoundary(a, b, ai, bargeIns);

    expect(result.decision).toBe("separate");
    expect(result.reasons).toEqual(["actual_ai_turn_between"]);
  });

  it("Case 5 — pre_playback AI response only (no actual ai_turn ever created): no semantic boundary solely because of it", () => {
    const a = turn({ itemId: "a", startMs: 1000, endMs: 2000 });
    const b = turn({ itemId: "b", startMs: 2400, endMs: 3000 }); // 400ms gap, well under the 2000ms ceiling
    const bargeIns = [bargeIn({ atMs: 2600, context: "pre_playback" })]; // within b's span

    const result = evaluateBoundary(a, b, [], bargeIns); // no AI turns at all — the response never produced audio

    expect(result.decision).toBe("merge");
  });

  it("Case 6 — ambiguous gap: no AI output, gap below the candidate ceiling but NOT negligible and uncorroborated -> do NOT merge automatically", () => {
    const a = turn({ itemId: "a", startMs: 1000, endMs: 2000 });
    const b = turn({ itemId: "b", startMs: 2800, endMs: 3500 }); // 800ms gap, no pre_playback evidence

    const result = evaluateBoundary(a, b, [], []);

    expect(result.decision).toBe("ambiguous");
    expect(result.gapMs).toBeGreaterThan(NEGLIGIBLE_GAP_MS);
    expect(result.gapMs).toBeLessThan(MAX_CANDIDATE_GAP_MS);
  });

  it("a gap at or above the candidate ceiling is separate even with no AI turn between", () => {
    const a = turn({ itemId: "a", startMs: 1000, endMs: 2000 });
    const b = turn({ itemId: "b", startMs: 2000 + MAX_CANDIDATE_GAP_MS, endMs: 5000 });

    const result = evaluateBoundary(a, b, [], []);

    expect(result.decision).toBe("separate");
    expect(result.reasons).toContain("gap_at_or_above_candidate_ceiling");
  });

  it("prefers the server audio clock for the gap when both turns have server timing, over the (possibly jittery) client clock", () => {
    const a = turn({ itemId: "a", startMs: 1000, endMs: 2000, serverAudioEndMs: 1950 });
    const b = turn({ itemId: "b", startMs: 2100, endMs: 3000, serverAudioStartMs: 1955 }); // server gap 5ms, client gap 100ms

    const result = evaluateBoundary(a, b, [], []);

    expect(result.gapSource).toBe("server_audio_clock");
    expect(result.gapMs).toBe(5);
    expect(result.decision).toBe("merge"); // 5ms is negligible on the server clock
  });
});

describe("attributeBargeInToTurn", () => {
  it("attributes a barge-in to whichever confirmed turn's span contains its timestamp", () => {
    const turns = [turn({ itemId: "a", startMs: 0, endMs: 100 }), turn({ itemId: "b", startMs: 200, endMs: 300 })];
    expect(attributeBargeInToTurn(250, turns)?.itemId).toBe("b");
    expect(attributeBargeInToTurn(150, turns)).toBeNull(); // falls in the gap between turns — no attribution
  });
});

describe("groupConfirmedTurnsIntoRuns", () => {
  it("Case 7 — suspected noise is never passed in as a candidate turn (caller's responsibility) and never appears in any run", () => {
    // groupConfirmedTurnsIntoRuns assumes its caller has already filtered to confirmed turns —
    // verify that assumption is honored by buildSemanticResponses in the companion build test file.
    // Here: a 3-turn chain groups correctly when suspected_noise turns are simply absent from input.
    const runs = groupConfirmedTurnsIntoRuns(
      [
        turn({ itemId: "u4", startMs: 83257.3, endMs: 88971.9 }),
        turn({ itemId: "u5", startMs: 89030.3, endMs: 92605.2 }),
        turn({ itemId: "u6", startMs: 92959.8, endMs: 110850.2 }),
      ],
      [],
      [bargeIn({ atMs: 89293.4, context: "pre_playback" }), bargeIn({ atMs: 93211.3, context: "pre_playback" })],
    );

    expect(runs).toHaveLength(1);
    expect(runs[0].turns.map((t) => t.itemId)).toEqual(["u4", "u5", "u6"]);
    expect(runs[0].internalBoundaries).toHaveLength(2);
  });

  it("chains stop at the first non-merge boundary — a later merge-eligible pair does not retroactively join an earlier separated run", () => {
    const runs = groupConfirmedTurnsIntoRuns(
      [
        turn({ itemId: "a", startMs: 0, endMs: 1000 }),
        turn({ itemId: "b", startMs: 4000, endMs: 5000 }), // ambiguous gap from a (3000ms > ceiling actually... use below)
        turn({ itemId: "c", startMs: 5000.5, endMs: 6000 }), // negligible gap from b
      ],
      [],
      [],
    );

    // a->b: 3000ms gap is at/above the 2000ms ceiling -> separate. b->c: negligible gap -> merge.
    expect(runs).toHaveLength(2);
    expect(runs[0].turns.map((t) => t.itemId)).toEqual(["a"]);
    expect(runs[1].turns.map((t) => t.itemId)).toEqual(["b", "c"]);
    expect(runs[1].precedingBoundary?.decision).toBe("separate");
  });

  it("returns an empty array for no confirmed turns", () => {
    expect(groupConfirmedTurnsIntoRuns([], [], [])).toEqual([]);
  });
});
