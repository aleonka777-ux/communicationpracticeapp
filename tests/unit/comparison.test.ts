import { describe, expect, it } from "vitest";
import { computeScoreDeltas } from "@/lib/coaching/comparison";

describe("computeScoreDeltas", () => {
  it("computes positive, negative, and zero deltas per dimension", () => {
    const current = { clarity: 4, assertiveness: 3, acknowledgment: 4, non_escalation: 2, technique: 5, effectiveness: 3 };
    const previous = { clarity: 2, assertiveness: 3, acknowledgment: 5, non_escalation: 2, technique: 1, effectiveness: 4 };

    const deltas = computeScoreDeltas(current, previous);

    expect(deltas.clarity).toBe(2);
    expect(deltas.assertiveness).toBe(0);
    expect(deltas.acknowledgment).toBe(-1);
    expect(deltas.non_escalation).toBe(0);
    expect(deltas.technique).toBe(4);
    expect(deltas.effectiveness).toBe(-1);
  });

  it("never manufactures improvement — identical attempts produce all-zero deltas", () => {
    const scores = { clarity: 3, assertiveness: 3, acknowledgment: 3, non_escalation: 3, technique: 3, effectiveness: 3 };
    const deltas = computeScoreDeltas(scores, scores);
    expect(Object.values(deltas).every((d) => d === 0)).toBe(true);
  });
});
