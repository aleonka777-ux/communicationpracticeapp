import "server-only";
import { getAIProvider } from "@/lib/ai";
import { buildEvaluationSystemPrompt, buildEvaluationUserPrompt, type EvaluationUserPromptInput } from "@/lib/coaching/promptBuilder";
import { evaluationJsonSchema, evaluationLLMOutputSchema, type EvaluationLLMOutput } from "@/lib/coaching/schema";
import type { CommunicationToolRow } from "@/lib/db/types";

export class EvaluationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EvaluationValidationError";
  }
}

/**
 * Runs the Layer 3 coaching evaluation and validates the structured output (see
 * /docs/ARCHITECTURE.md §6). One controlled retry on validation failure; throws rather than ever
 * returning/persisting a partially-valid result (per the build brief's AI-output-validation rule).
 */
export async function runEvaluation(
  tool: CommunicationToolRow,
  promptInput: EvaluationUserPromptInput,
): Promise<EvaluationLLMOutput> {
  const provider = getAIProvider();
  const systemPrompt = buildEvaluationSystemPrompt(tool);
  const basePrompt = buildEvaluationUserPrompt(promptInput);

  async function attempt(extraInstruction?: string) {
    const { raw } = await provider.generateEvaluation({
      systemPrompt,
      userPrompt: extraInstruction ? `${basePrompt}\n\n${extraInstruction}` : basePrompt,
      jsonSchema: evaluationJsonSchema,
      schemaName: "communication_evaluation",
    });
    return evaluationLLMOutputSchema.safeParse(raw);
  }

  let result = await attempt();
  if (!result.success) {
    result = await attempt(
      `Your previous response did not match the required schema (${result.error.message}). Return corrected JSON that matches the schema exactly.`,
    );
  }

  if (!result.success) {
    throw new EvaluationValidationError(
      `AI coach output failed schema validation twice: ${result.error.message}`,
    );
  }

  return result.data;
}
