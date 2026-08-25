import { describe, expect, it } from "vitest";
import { buildEvaluationSystemPrompt } from "@/lib/coaching/promptBuilder";
import type { CommunicationToolRow } from "@/lib/db/types";

const tool: CommunicationToolRow = {
  id: "tool-1",
  slug: "test-tool",
  name: "Test Tool",
  short_description: "",
  purpose: "Practise a technique.",
  when_to_use: "",
  core_principles: ["Be clear"],
  step_by_step_method: [],
  good_examples: [],
  weak_examples: [],
  common_mistakes: [],
  evaluation_criteria: { clarity: "Was the message clear?" },
  coaching_guidance: "",
  evaluation_weights: {
    clarity: 1,
    assertiveness: 1,
    acknowledgment: 1,
    non_escalation: 1,
    technique: 1,
    effectiveness: 1,
  },
  active: true,
  created_at: "",
  updated_at: "",
};

describe("buildEvaluationSystemPrompt — paralinguistic safety guardrail", () => {
  const prompt = buildEvaluationSystemPrompt(tool);

  it("tells the coach it only has a text transcript, no audio/vocal data", () => {
    expect(prompt).toMatch(/only been given a text transcript/i);
    expect(prompt).toMatch(/no audio/i);
  });

  it("explicitly forbids claiming to observe tone, pace, pauses, or emotion", () => {
    expect(prompt).toMatch(/tone of voice/i);
    expect(prompt).toMatch(/pace/i);
    expect(prompt).toMatch(/pauses/i);
    expect(prompt).toMatch(/confidence/i);
    expect(prompt).toMatch(/emotion/i);
    expect(prompt).toMatch(/paralinguistic/i);
  });
});
