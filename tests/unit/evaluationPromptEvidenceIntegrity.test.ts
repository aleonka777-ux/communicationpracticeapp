import { describe, expect, it } from "vitest";
import { buildEvaluationSystemPrompt } from "@/lib/coaching/promptBuilder";
import type { CommunicationToolRow } from "@/lib/db/types";

/**
 * Regression coverage for a real production defect: the coach only ever receives a text
 * transcript (no audio), but it generated claims like "The user maintained a calm demeanor
 * throughout the conversation" and "User responded without raising their voice." The root cause
 * was the seeded rubric content itself instructing this — e.g. the "setting-a-boundary" tool's
 * Non-escalation criterion literally asked "Did the user stay calm..." These fixtures mirror the
 * corrected supabase/seed.sql content (see docs/DECISIONS.md "Evidence integrity") so a future
 * revert of that fix — or of the prompt builder's override clause — fails this test immediately.
 */
function baseTool(overrides: Partial<CommunicationToolRow>): CommunicationToolRow {
  return {
    id: "tool-1",
    slug: "test-tool",
    name: "Test Tool",
    short_description: "",
    purpose: "Practise a technique.",
    when_to_use: "",
    core_principles: [],
    step_by_step_method: [],
    good_examples: [],
    weak_examples: [],
    common_mistakes: [],
    evaluation_criteria: {},
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
    ...overrides,
  };
}

const respondingToAggression = baseTool({
  slug: "responding-to-aggression",
  name: "Responding to Aggression",
  core_principles: [
    "Acknowledge the other person's emotion before responding to content.",
    "Separate the observable behavior from your interpretation of intent.",
    "State your own position in one or two clear sentences.",
    "Avoid mirroring the other person's hostility or using escalating language.",
  ],
  common_mistakes: [
    "Matching the other person's hostility with similarly aggressive language.",
    "Over-explaining or justifying before acknowledging the concern.",
  ],
  evaluation_criteria: {
    non_escalation:
      "Based on the words used in the transcript, did the user avoid hostile or retaliatory language and avoid provoking further anger?",
  },
  coaching_guidance:
    "Prioritize whether the user acknowledged the emotion or concern before defending or explaining. Reward concise, non-escalatory wording over long justifications.",
});

const settingABoundary = baseTool({
  slug: "setting-a-boundary",
  name: "Setting a Boundary",
  common_mistakes: [
    "Over-justifying with multiple reasons, inviting negotiation.",
    "Escalating to anger instead of simply restating the limit.",
  ],
  evaluation_criteria: {
    non_escalation:
      "Based on the words used in the transcript, did the user's language stay non-escalatory and avoid turning the exchange into a conflict?",
  },
});

const BANNED_SUBSTRINGS = [
  "stay calm",
  "reward calm",
  "calmly",
  "or volume",
  "an unfair tone",
  "just the tone",
  "arguing about tone",
  "the tone stayed calm",
];

describe("Evaluation Engine evidence integrity — production regression", () => {
  it.each([
    ["responding-to-aggression", respondingToAggression],
    ["setting-a-boundary", settingABoundary],
  ])("%s: rubric content no longer asks the coach to judge calmness or tone", (_slug, tool) => {
    const prompt = buildEvaluationSystemPrompt(tool).toLowerCase();
    for (const banned of BANNED_SUBSTRINGS) {
      expect(prompt).not.toContain(banned);
    }
  });

  it("Non-escalation criteria are phrased as explicitly transcript/wording-based", () => {
    expect(respondingToAggression.evaluation_criteria.non_escalation).toMatch(/words used in the transcript/i);
    expect(settingABoundary.evaluation_criteria.non_escalation).toMatch(/words used in the transcript/i);
  });

  it("the prompt still forbids the exact production claims, even if a criterion is re-worded with 'calm' or 'tone' later", () => {
    // Simulates a coach re-introducing the old wording via /admin — the override clause in the
    // prompt builder is the second line of defense and must still neutralize it.
    const regressedTool = baseTool({
      slug: "setting-a-boundary",
      evaluation_criteria: { non_escalation: "Did the user stay calm and avoid turning the exchange into a conflict?" },
    });
    const prompt = buildEvaluationSystemPrompt(regressedTool);
    expect(prompt).toMatch(/overrides anything above/i);
    expect(prompt).toMatch(/judge it purely by the wording and language choices/i);
  });

  it("explicitly names the exact production claims as forbidden examples", () => {
    const prompt = buildEvaluationSystemPrompt(baseTool({}));
    expect(prompt.toLowerCase()).toContain("maintained a calm demeanor");
    expect(prompt.toLowerCase()).toContain("didn't raise their voice");
  });
});
