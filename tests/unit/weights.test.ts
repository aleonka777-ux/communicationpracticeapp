import { describe, expect, it } from "vitest";
import { mergeWeights, weightedOverallScore } from "@/lib/coaching/weights";
import type { EvaluationWeights } from "@/lib/db/types";

const equalWeights: EvaluationWeights = {
  clarity: 1 / 6,
  assertiveness: 1 / 6,
  acknowledgment: 1 / 6,
  non_escalation: 1 / 6,
  technique: 1 / 6,
  effectiveness: 1 / 6,
};

describe("mergeWeights", () => {
  it("returns the base weights when there is no override", () => {
    expect(mergeWeights(equalWeights)).toEqual(equalWeights);
    expect(mergeWeights(equalWeights, {})).toEqual(equalWeights);
  });

  it("applies a partial override and renormalizes to sum to 1", () => {
    const merged = mergeWeights(equalWeights, { technique: 0.5 });
    const sum = Object.values(merged).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 5);
    expect(merged.technique).toBeGreaterThan(equalWeights.technique);
  });

  it("falls back to base weights if every dimension is overridden to zero", () => {
    const allZero = {
      clarity: 0,
      assertiveness: 0,
      acknowledgment: 0,
      non_escalation: 0,
      technique: 0,
      effectiveness: 0,
    };
    expect(mergeWeights(equalWeights, allZero)).toEqual(equalWeights);
  });
});

describe("weightedOverallScore", () => {
  it("computes a straightforward weighted average", () => {
    const scores = {
      clarity: 4,
      assertiveness: 4,
      acknowledgment: 4,
      non_escalation: 4,
      technique: 4,
      effectiveness: 4,
    };
    expect(weightedOverallScore(scores, equalWeights)).toBeCloseTo(4, 2);
  });

  it("weighs higher-weighted dimensions more heavily", () => {
    const heavyOnTechnique: EvaluationWeights = { ...equalWeights, technique: 0.6, effectiveness: 0.06, clarity: 0.06, assertiveness: 0.06, acknowledgment: 0.06, non_escalation: 0.16 };
    const scores = { clarity: 1, assertiveness: 1, acknowledgment: 1, non_escalation: 1, technique: 5, effectiveness: 1 };
    expect(weightedOverallScore(scores, heavyOnTechnique)).toBeGreaterThan(2.5);
  });
});
