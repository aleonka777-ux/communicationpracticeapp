import { describe, expect, it, vi, beforeEach } from "vitest";
import type { CommunicationToolRow, ScenarioRow, ConversationMessageRow } from "@/lib/db/types";
import type { EvaluationLLMOutput } from "@/lib/coaching/schema";

const { generateEvaluation, getAIProvider } = vi.hoisted(() => ({
  generateEvaluation: vi.fn(),
  getAIProvider: vi.fn(),
}));

vi.mock("@/lib/ai", () => ({
  getAIProvider: () => getAIProvider(),
}));

import { runEvaluation, EvaluationValidationError } from "@/lib/coaching/evaluationEngine";

function tool(): CommunicationToolRow {
  return {
    id: "tool-1",
    slug: "setting-a-boundary",
    name: "Setting a Boundary",
    short_description: "",
    purpose: "Say no clearly.",
    when_to_use: "",
    core_principles: [],
    step_by_step_method: [],
    good_examples: [],
    weak_examples: [],
    common_mistakes: [],
    evaluation_criteria: { non_escalation: "Based on the words used in the transcript, did the user avoid escalating language?" },
    coaching_guidance: "",
    evaluation_weights: { clarity: 1, assertiveness: 1, acknowledgment: 1, non_escalation: 1, technique: 1, effectiveness: 1 },
    active: true,
    created_at: "",
    updated_at: "",
  };
}

function scenario(): ScenarioRow {
  return {
    id: "scenario-1",
    tool_id: "tool-1",
    title: "Test scenario",
    context: "A coworker asks for a favor.",
    user_role: "",
    user_objective: "Decline clearly.",
    ai_role: "",
    relationship: "",
    ai_personality: "",
    ai_objective: "",
    emotional_intensity: "low",
    difficulty: "beginner",
    opening_line: "Hey, any chance you could help?",
    character_behaviours: [],
    escalation_rules: [],
    deescalation_rules: [],
    scenario_constraints: [],
    evaluation_overrides: {},
    active: true,
    created_at: "",
    updated_at: "",
  };
}

function transcript(): ConversationMessageRow[] {
  return [
    { id: "m1", session_id: "s1", sequence: 1, speaker: "interlocutor", text: "Hey, any chance you could help?", created_at: "" },
    { id: "m2", session_id: "s1", sequence: 2, speaker: "user", text: "I can't take this on this week.", created_at: "" },
  ];
}

function cleanOutput(): EvaluationLLMOutput {
  return {
    overall_summary: "The user stated the boundary clearly and did not use escalating language.",
    dimensions: {
      clarity: { score: 4, evidence: "Said it in one sentence.", explanation: "Direct." },
      assertiveness: { score: 4, evidence: "Held the line.", explanation: "Did not hedge." },
      acknowledgment: { score: 3, evidence: "Acknowledged the request.", explanation: "Brief." },
      non_escalation: { score: 4, evidence: "Did not use hostile language.", explanation: "Wording stayed non-escalatory." },
      technique: { score: 4, evidence: "Stated the boundary directly.", explanation: "Followed the method." },
      effectiveness: { score: 4, evidence: "The boundary held.", explanation: "Goal achieved." },
    },
    strengths: [{ point: "Clear wording.", evidence: "Direct sentence." }],
    improvement_areas: [{ issue: "Could acknowledge more.", why_it_matters: "Builds rapport.", suggestion: "Add a line.", example: "" }],
    next_focus: "Practice acknowledging before restating.",
    comparison_notes: [],
  };
}

function violatingOutput(): EvaluationLLMOutput {
  return { ...cleanOutput(), overall_summary: "The user maintained a respectful tone throughout the conversation." };
}

describe("runEvaluation — evidence-integrity reject/regenerate", () => {
  beforeEach(() => {
    generateEvaluation.mockReset();
    getAIProvider.mockReturnValue({ name: "mock", generateEvaluation });
  });

  it("returns the result unchanged when the first attempt is already clean", async () => {
    generateEvaluation.mockResolvedValueOnce({ raw: cleanOutput() });

    const result = await runEvaluation(tool(), { scenario: scenario(), transcript: transcript(), hintCount: 0 });

    expect(result.overall_summary).toContain("did not use escalating language");
    expect(generateEvaluation).toHaveBeenCalledTimes(1);
  });

  it("regenerates once when the output makes a paralinguistic claim ('maintained a respectful tone'), and returns the clean retry", async () => {
    generateEvaluation.mockResolvedValueOnce({ raw: violatingOutput() }).mockResolvedValueOnce({ raw: cleanOutput() });

    const result = await runEvaluation(tool(), { scenario: scenario(), transcript: transcript(), hintCount: 0 });

    expect(result.overall_summary).not.toMatch(/tone/i);
    expect(generateEvaluation).toHaveBeenCalledTimes(2);
    // The retry instruction should tell the model what it did wrong, without ever needing to
    // touch the transcript itself.
    const secondCallPrompt = generateEvaluation.mock.calls[1][0].userPrompt as string;
    expect(secondCallPrompt).toMatch(/audio or vocal evidence/i);
  });

  it("rejects (throws) rather than displaying feedback if the regenerated output still violates", async () => {
    generateEvaluation.mockResolvedValueOnce({ raw: violatingOutput() }).mockResolvedValueOnce({ raw: violatingOutput() });

    await expect(runEvaluation(tool(), { scenario: scenario(), transcript: transcript(), hintCount: 0 })).rejects.toThrow(
      EvaluationValidationError,
    );
    expect(generateEvaluation).toHaveBeenCalledTimes(2);
  });
});
