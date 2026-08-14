import { z } from "zod";

/**
 * Shape the AI Coach must return, validated before anything is persisted (see
 * /docs/ARCHITECTURE.md §6, Layer 3). `comparison_notes` is always present (possibly empty) so
 * the OpenAI structured-output schema can stay in strict mode without optional fields.
 */
const dimensionScoreSchema = z.object({
  score: z.number().int().min(1).max(5),
  evidence: z.string().min(1).max(400),
  explanation: z.string().min(1).max(400),
});

export const evaluationLLMOutputSchema = z.object({
  overall_summary: z.string().min(1).max(800),
  dimensions: z.object({
    clarity: dimensionScoreSchema,
    assertiveness: dimensionScoreSchema,
    acknowledgment: dimensionScoreSchema,
    non_escalation: dimensionScoreSchema,
    technique: dimensionScoreSchema,
    effectiveness: dimensionScoreSchema,
  }),
  strengths: z.array(z.object({ point: z.string().min(1).max(300), evidence: z.string().min(1).max(300) })).min(1).max(4),
  improvement_areas: z
    .array(
      z.object({
        issue: z.string().min(1).max(300),
        why_it_matters: z.string().min(1).max(300),
        suggestion: z.string().min(1).max(300),
        example: z.string().max(300),
      }),
    )
    .min(1)
    .max(3),
  next_focus: z.string().min(1).max(300),
  comparison_notes: z.array(z.string().min(1).max(300)).max(4),
});

export type EvaluationLLMOutput = z.infer<typeof evaluationLLMOutputSchema>;

const dimensionJsonSchema = {
  type: "object",
  properties: {
    score: { type: "integer", minimum: 1, maximum: 5 },
    evidence: { type: "string" },
    explanation: { type: "string" },
  },
  required: ["score", "evidence", "explanation"],
  additionalProperties: false,
};

/** Hand-authored JSON Schema mirroring evaluationLLMOutputSchema, for OpenAI strict structured outputs. */
export const evaluationJsonSchema = {
  type: "object",
  properties: {
    overall_summary: { type: "string" },
    dimensions: {
      type: "object",
      properties: {
        clarity: dimensionJsonSchema,
        assertiveness: dimensionJsonSchema,
        acknowledgment: dimensionJsonSchema,
        non_escalation: dimensionJsonSchema,
        technique: dimensionJsonSchema,
        effectiveness: dimensionJsonSchema,
      },
      required: ["clarity", "assertiveness", "acknowledgment", "non_escalation", "technique", "effectiveness"],
      additionalProperties: false,
    },
    strengths: {
      type: "array",
      items: {
        type: "object",
        properties: { point: { type: "string" }, evidence: { type: "string" } },
        required: ["point", "evidence"],
        additionalProperties: false,
      },
      minItems: 1,
      maxItems: 4,
    },
    improvement_areas: {
      type: "array",
      items: {
        type: "object",
        properties: {
          issue: { type: "string" },
          why_it_matters: { type: "string" },
          suggestion: { type: "string" },
          example: { type: "string", description: "Leave as an empty string if no example is needed." },
        },
        required: ["issue", "why_it_matters", "suggestion", "example"],
        additionalProperties: false,
      },
      minItems: 1,
      maxItems: 3,
    },
    next_focus: { type: "string" },
    comparison_notes: {
      type: "array",
      items: { type: "string" },
      maxItems: 4,
      description: "Empty array if this is the user's first attempt at this scenario.",
    },
  },
  required: ["overall_summary", "dimensions", "strengths", "improvement_areas", "next_focus", "comparison_notes"],
  additionalProperties: false,
} as const;
