import { describe, expect, it } from "vitest";
import { evaluationLLMOutputSchema } from "@/lib/coaching/schema";

function validEvaluation() {
  const dim = { score: 4, evidence: "quote from transcript", explanation: "why it matters" };
  return {
    overall_summary: "A concise, grounded summary.",
    dimensions: {
      clarity: dim,
      assertiveness: dim,
      acknowledgment: dim,
      non_escalation: dim,
      technique: dim,
      effectiveness: dim,
    },
    strengths: [{ point: "Stayed calm.", evidence: "quote" }],
    improvement_areas: [{ issue: "Too vague.", why_it_matters: "Confused the other person.", suggestion: "Be specific.", example: "" }],
    next_focus: "State your ask in one sentence.",
    comparison_notes: [],
  };
}

describe("evaluationLLMOutputSchema", () => {
  it("accepts a well-formed evaluation", () => {
    const result = evaluationLLMOutputSchema.safeParse(validEvaluation());
    expect(result.success).toBe(true);
  });

  it("rejects a score outside the 1-5 range", () => {
    const bad = validEvaluation();
    bad.dimensions.clarity.score = 7;
    const result = evaluationLLMOutputSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects a score of 0 (must be at least 1)", () => {
    const bad = validEvaluation();
    bad.dimensions.technique.score = 0;
    expect(evaluationLLMOutputSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a non-integer score", () => {
    const bad = validEvaluation();
    bad.dimensions.effectiveness.score = 3.5;
    expect(evaluationLLMOutputSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a missing dimension", () => {
    const bad = validEvaluation() as Record<string, unknown>;
    const dimensions = bad.dimensions as Record<string, unknown>;
    delete dimensions.technique;
    expect(evaluationLLMOutputSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects empty strengths (at least one is required)", () => {
    const bad = validEvaluation();
    bad.strengths = [];
    expect(evaluationLLMOutputSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects raw model output that isn't even an object", () => {
    expect(evaluationLLMOutputSchema.safeParse("not an evaluation").success).toBe(false);
    expect(evaluationLLMOutputSchema.safeParse(null).success).toBe(false);
    expect(evaluationLLMOutputSchema.safeParse(undefined).success).toBe(false);
  });

  it("accepts an empty comparison_notes array for a first attempt", () => {
    const evaluation = validEvaluation();
    evaluation.comparison_notes = [];
    expect(evaluationLLMOutputSchema.safeParse(evaluation).success).toBe(true);
  });
});
