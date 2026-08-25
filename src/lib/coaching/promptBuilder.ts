import type { CommunicationToolRow, ConversationMessageRow, EvaluationRow, ScenarioRow } from "@/lib/db/types";

function bulletList(items: string[]): string {
  return items.map((item) => `- ${item}`).join("\n");
}

function formatTranscript(messages: { speaker: string; text: string }[]): string {
  return messages
    .filter((m) => m.speaker !== "coach_hint")
    .map((m) => `${m.speaker === "user" ? "User" : "Other person"}: ${m.text}`)
    .join("\n");
}

/** System prompt for Layer 3 — the AI Coach. Includes the full methodology (unlike the interlocutor prompt). */
export function buildEvaluationSystemPrompt(tool: CommunicationToolRow): string {
  const criteriaLines = Object.entries(tool.evaluation_criteria)
    .map(([dim, guidance]) => `- ${dim}: ${guidance}`)
    .join("\n");

  const sections = [
    "You are an experienced, evidence-based communication coach reviewing a practice conversation that just ended. You are not playing a character anymore — analyze what happened.",
    `Technique being practised: "${tool.name}". ${tool.purpose}`,
    tool.core_principles.length > 0 ? `Core principles:\n${bulletList(tool.core_principles)}` : "",
    tool.step_by_step_method.length > 0
      ? `Recommended method:\n${tool.step_by_step_method.map((s) => `- ${s.step}: ${s.description}`).join("\n")}`
      : "",
    tool.common_mistakes.length > 0 ? `Common mistakes to watch for:\n${bulletList(tool.common_mistakes)}` : "",
    tool.coaching_guidance ? `Coaching guidance from this program: ${tool.coaching_guidance}` : "",
    criteriaLines ? `Evaluation criteria per dimension:\n${criteriaLines}` : "",
    "Ground every score and claim in specific evidence from the transcript below — quote or closely paraphrase what was actually said. Never invent or assume anything not present in the transcript. Avoid generic encouragement; be specific about what worked and what didn't. Clearly distinguish observable behavior from your interpretation of it. Never make psychological diagnoses. Scores are communication-practice indicators on a 1-5 scale, not measurements of the person's character or worth. Do not use exaggerated praise.",
    "You have only been given a text transcript of what was said — no audio, and no measurements of tone, pace, pauses, timing, volume, or any other vocal quality. Never claim to have heard, observed, sensed, or measured the person's tone of voice, pace, pauses, hesitation, confidence, nervousness, calmness, emotion, or any other paralinguistic or vocal signal. Do not describe how something was said (e.g. \"said calmly\", \"sounded frustrated\", \"spoke hesitantly\") — only ever address what was said, using the words actually present in the transcript.",
    "If a previous attempt is included below, compare this attempt to it using only differences that are actually visible in the two transcripts. Do not manufacture improvement — a score can legitimately stay the same or go down.",
  ];

  return sections.filter(Boolean).join("\n\n");
}

export interface EvaluationUserPromptInput {
  scenario: ScenarioRow;
  transcript: ConversationMessageRow[];
  hintCount: number;
  previous?: {
    evaluation: EvaluationRow;
    transcript: ConversationMessageRow[];
  };
}

export function buildEvaluationUserPrompt(input: EvaluationUserPromptInput): string {
  const lines = [
    `SCENARIO OBJECTIVE FOR THE USER: ${input.scenario.user_objective}`,
    `SCENARIO CONTEXT: ${input.scenario.context}`,
    input.hintCount > 0
      ? `The user requested ${input.hintCount} hint(s) during this attempt (Training Mode). Weigh that in — performance without hints is stronger evidence of independent skill.`
      : "The user completed this attempt without requesting any hints.",
    "TRANSCRIPT:",
    formatTranscript(input.transcript),
  ];

  if (input.previous) {
    lines.push(
      "PREVIOUS ATTEMPT (for comparison only — do not evaluate this one, only use it to write comparison_notes):",
    );
    lines.push(`Previous overall summary: ${input.previous.evaluation.overall_summary}`);
    lines.push(
      `Previous scores — clarity: ${input.previous.evaluation.clarity_score}, assertiveness: ${input.previous.evaluation.assertiveness_score}, acknowledgment: ${input.previous.evaluation.acknowledgment_score}, non-escalation: ${input.previous.evaluation.non_escalation_score}, technique: ${input.previous.evaluation.technique_score}, effectiveness: ${input.previous.evaluation.effectiveness_score}.`,
    );
    lines.push("Previous transcript:");
    lines.push(formatTranscript(input.previous.transcript));
  }

  return lines.join("\n\n");
}

/** System prompt for a Training Mode hint — a much smaller ask than a full evaluation. */
export function buildHintSystemPrompt(tool: CommunicationToolRow): string {
  const sections = [
    "You are a communication coach giving ONE brief, real-time hint during a live practice conversation that is still in progress. Speak directly to the user as their coach, not as the character in the roleplay.",
    `Technique being practised: "${tool.name}". ${tool.purpose}`,
    tool.core_principles.length > 0 ? `Principles:\n${bulletList(tool.core_principles)}` : "",
    "Give exactly one short, concrete suggestion (a single sentence) for what the user could do or say next, based on the conversation so far. Do not give a full scripted line for them to say verbatim. Do not summarize the whole technique. Do not praise or grade what they've done so far — just the one forward-looking suggestion.",
  ];
  return sections.filter(Boolean).join("\n\n");
}
