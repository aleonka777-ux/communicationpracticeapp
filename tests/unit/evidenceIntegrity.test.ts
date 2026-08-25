import { describe, expect, it } from "vitest";
import {
  findAllParalinguisticViolations,
  findParalinguisticViolation,
  sanitizeEvaluationOutput,
  sanitizeParalinguisticText,
  VOCAL_EVIDENCE_AVAILABLE,
} from "@/lib/coaching/evidenceIntegrity";
import type { EvaluationLLMOutput } from "@/lib/coaching/schema";

function validOutput(overrides: Partial<EvaluationLLMOutput> = {}): EvaluationLLMOutput {
  return {
    overall_summary: "The user stated their position clearly and did not use hostile language.",
    dimensions: {
      clarity: { score: 4, evidence: "Stated the boundary in one sentence.", explanation: "Direct and specific." },
      assertiveness: { score: 4, evidence: "Held the position under pushback.", explanation: "Did not back down." },
      acknowledgment: { score: 3, evidence: "Acknowledged the other person's request.", explanation: "Brief but present." },
      non_escalation: { score: 4, evidence: "Did not use hostile or escalating language.", explanation: "Wording stayed non-escalatory." },
      technique: { score: 4, evidence: "Stated, then restated the limit.", explanation: "Followed the method." },
      effectiveness: { score: 4, evidence: "The boundary held by the end.", explanation: "Goal achieved." },
    },
    strengths: [{ point: "Clear wording.", evidence: "Used a direct, unambiguous sentence." }],
    improvement_areas: [
      { issue: "Could acknowledge more.", why_it_matters: "Builds rapport.", suggestion: "Add one acknowledging sentence.", example: "" },
    ],
    next_focus: "Practice acknowledging the other person's position before restating the boundary.",
    comparison_notes: [],
    ...overrides,
  };
}

describe("VOCAL_EVIDENCE_AVAILABLE", () => {
  it("is false — no vocal metrics pipeline exists yet", () => {
    expect(VOCAL_EVIDENCE_AVAILABLE).toBe(false);
  });
});

describe("findParalinguisticViolation — production regression", () => {
  it("catches 'The user maintained a respectful tone…' (production example 1)", () => {
    const output = validOutput({ overall_summary: "The user maintained a respectful tone…" });
    const violation = findParalinguisticViolation(output);
    expect(violation).not.toBeNull();
    expect(violation?.field).toBe("overall_summary");
    expect(violation?.concept).toBe("tone");
  });

  it("catches 'Maintained a respectful tone throughout the conversation.' (production example 2)", () => {
    const output = validOutput({
      dimensions: {
        ...validOutput().dimensions,
        non_escalation: {
          score: 4,
          evidence: "Maintained a respectful tone throughout the conversation.",
          explanation: "Stayed non-escalatory.",
        },
      },
    });
    const violation = findParalinguisticViolation(output);
    expect(violation).not.toBeNull();
    expect(violation?.field).toBe("dimensions.non_escalation.evidence");
    expect(violation?.concept).toBe("tone");
  });

  it("catches the earlier production examples too (calm demeanor, raised voice)", () => {
    expect(
      findParalinguisticViolation(validOutput({ overall_summary: "The user maintained a calm demeanor throughout the conversation." })),
    ).not.toBeNull();
    expect(
      findParalinguisticViolation(validOutput({ overall_summary: "User responded without raising their voice or becoming defensive." })),
    ).not.toBeNull();
  });

  it("catches other paralinguistic concepts: volume, pace, pauses, hesitation, vocal, sounded-adjective", () => {
    expect(findParalinguisticViolation(validOutput({ overall_summary: "The user kept their volume steady." }))).not.toBeNull();
    expect(findParalinguisticViolation(validOutput({ overall_summary: "The user spoke at a measured pace." }))).not.toBeNull();
    expect(findParalinguisticViolation(validOutput({ overall_summary: "The user paused before responding." }))).not.toBeNull();
    expect(findParalinguisticViolation(validOutput({ overall_summary: "The user showed some hesitation." }))).not.toBeNull();
    expect(findParalinguisticViolation(validOutput({ overall_summary: "The user's vocal delivery was steady." }))).not.toBeNull();
    expect(findParalinguisticViolation(validOutput({ overall_summary: "The user sounded confident." }))).not.toBeNull();
  });

  it("returns null for a clean, transcript-only evaluation", () => {
    expect(findParalinguisticViolation(validOutput())).toBeNull();
  });

  it("does not flag legitimate acknowledgment language that happens to say 'emotion'", () => {
    // Acknowledging the OTHER person's stated emotion in words is desired, transcript-based
    // content central to several tools' own methodology — not a claim about vocal delivery.
    const output = validOutput({
      overall_summary: "The user acknowledged the other person's emotion by saying \"I can see this is frustrating.\"",
    });
    expect(findParalinguisticViolation(output)).toBeNull();
  });
});

describe("findAllParalinguisticViolations", () => {
  it("returns every violating field, not just the first", () => {
    const output = validOutput({
      overall_summary: "The user maintained a respectful tone.",
      dimensions: {
        ...validOutput().dimensions,
        non_escalation: { score: 4, evidence: "Did not raise their voice.", explanation: "Stayed calm." },
      },
    });
    const violations = findAllParalinguisticViolations(output);
    expect(violations).toHaveLength(3);
    expect(violations.map((v) => v.field)).toEqual([
      "overall_summary",
      "dimensions.non_escalation.evidence",
      "dimensions.non_escalation.explanation",
    ]);
  });

  it("returns an empty array for a clean evaluation", () => {
    expect(findAllParalinguisticViolations(validOutput())).toEqual([]);
  });
});

describe("sanitizeParalinguisticText — meaning-preserving rewrites", () => {
  it.each([
    ["The user maintained a respectful tone.", "respectful wording"],
    ["The user kept a calm tone throughout.", "non-escalatory language"],
    ["User responded without raising their voice.", "hostile or escalating language"],
    ["The user sounded confident when declining.", "stated their position directly"],
  ])("rewrites %s", (input, expectedFragment) => {
    const result = sanitizeParalinguisticText(input);
    expect(result.toLowerCase()).toContain(expectedFragment.toLowerCase());
    expect(findParalinguisticViolation(validOutput({ overall_summary: result }))).toBeNull();
  });
});

describe("sanitizeEvaluationOutput", () => {
  it("production regression: dimensions.non_escalation.explanation containing 'tone' is rewritten, not dropped", () => {
    const output = validOutput({
      dimensions: {
        ...validOutput().dimensions,
        non_escalation: {
          score: 4,
          evidence: "Did not use hostile language.",
          explanation: "The user's tone remained composed and non-escalatory throughout.",
        },
      },
    });

    const { output: sanitizedOutput, sanitized } = sanitizeEvaluationOutput(output);

    expect(findParalinguisticViolation(sanitizedOutput)).toBeNull();
    expect(sanitizedOutput.dimensions.non_escalation.explanation).not.toMatch(/\btone\b/i);
    expect(sanitizedOutput.dimensions.non_escalation.explanation.length).toBeGreaterThan(0);
    expect(sanitized).toEqual([{ field: "dimensions.non_escalation.explanation", concept: "tone", method: "phrase_rewrite" }]);

    // Untouched fields are byte-for-byte identical.
    expect(sanitizedOutput.dimensions.non_escalation.evidence).toBe("Did not use hostile language.");
    expect(sanitizedOutput.overall_summary).toBe(output.overall_summary);
  });

  it("falls back to a neutral statement when no safe rewrite exists (e.g. 'hesitation')", () => {
    const output = validOutput({ overall_summary: "The user showed some hesitation before responding." });

    const { output: sanitizedOutput, sanitized } = sanitizeEvaluationOutput(output);

    expect(findParalinguisticViolation(sanitizedOutput)).toBeNull();
    expect(sanitizedOutput.overall_summary.length).toBeGreaterThan(0);
    expect(sanitized).toEqual([{ field: "overall_summary", concept: "hesitation", method: "neutral_fallback" }]);
  });

  it("sanitizes multiple violating fields independently, leaving everything else intact", () => {
    const output = validOutput({
      overall_summary: "The user maintained a respectful tone.",
      dimensions: {
        ...validOutput().dimensions,
        non_escalation: { score: 4, evidence: "Did not raise their voice.", explanation: "Stayed calm." },
      },
    });

    const { output: sanitizedOutput, sanitized } = sanitizeEvaluationOutput(output);

    expect(findAllParalinguisticViolations(sanitizedOutput)).toEqual([]);
    expect(sanitized).toHaveLength(3);
    // A single bad set of fields never touches unrelated dimensions/strengths/next_focus.
    expect(sanitizedOutput.dimensions.clarity).toEqual(output.dimensions.clarity);
    expect(sanitizedOutput.strengths).toEqual(output.strengths);
    expect(sanitizedOutput.next_focus).toBe(output.next_focus);
  });

  it("never leaves a field empty unless the schema allows it (the 'example' field only)", () => {
    const output = validOutput({
      improvement_areas: [
        { issue: "Showed some hesitation.", why_it_matters: "Confidence matters.", suggestion: "Be direct.", example: "" },
      ],
    });
    const { output: sanitizedOutput } = sanitizeEvaluationOutput(output);
    expect(sanitizedOutput.improvement_areas[0].issue.length).toBeGreaterThan(0);
  });
});
