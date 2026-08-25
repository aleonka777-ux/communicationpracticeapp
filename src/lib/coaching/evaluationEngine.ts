import "server-only";
import { getAIProvider } from "@/lib/ai";
import { buildEvaluationSystemPrompt, buildEvaluationUserPrompt, type EvaluationUserPromptInput } from "@/lib/coaching/promptBuilder";
import { evaluationJsonSchema, evaluationLLMOutputSchema, type EvaluationLLMOutput } from "@/lib/coaching/schema";
import { findParalinguisticViolation, VOCAL_EVIDENCE_AVAILABLE } from "@/lib/coaching/evidenceIntegrity";
import type { CommunicationToolRow } from "@/lib/db/types";

export class EvaluationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EvaluationValidationError";
  }
}

/**
 * Runs the Layer 3 coaching evaluation and validates the structured output (see
 * /docs/ARCHITECTURE.md §6). One controlled retry on schema-validation failure, and — while
 * VOCAL_EVIDENCE_AVAILABLE is false — a second, separate controlled retry if the output makes a
 * paralinguistic/audio claim the transcript-only prompt has no basis for (production has shown
 * the prompt-level guardrail alone is not reliable enough on its own). Throws rather than ever
 * returning/persisting a result that fails either check (per the build brief's
 * AI-output-validation rule) — the caller (/api/practice/end) already surfaces this as "couldn't
 * generate reliable feedback, please try again" rather than displaying it.
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

  if (!VOCAL_EVIDENCE_AVAILABLE) {
    const violation = findParalinguisticViolation(result.data);
    if (violation) {
      console.error("[coaching:evaluation] rejected output with an unsupported paralinguistic claim, regenerating", {
        field: violation.field,
        concept: violation.concept,
      });

      const retryResult = await attempt(
        `Your previous response included a claim about ${violation.concept} (in ${violation.field}) — that implies audio or vocal evidence, but you were only given a text transcript with no audio. Rewrite the ENTIRE evaluation without any claim about tone of voice, volume, pace, pauses, hesitation, calmness, demeanor, or emotional state — describe only the wording and language choices actually visible in the transcript.`,
      );

      if (!retryResult.success) {
        throw new EvaluationValidationError(
          `AI coach output failed schema validation on evidence-integrity retry: ${retryResult.error.message}`,
        );
      }

      const retryViolation = findParalinguisticViolation(retryResult.data);
      if (retryViolation) {
        console.error("[coaching:evaluation] regenerated output still made an unsupported paralinguistic claim, rejecting", {
          field: retryViolation.field,
          concept: retryViolation.concept,
        });
        throw new EvaluationValidationError(
          "AI coach output made an unsupported vocal/tone claim twice and was rejected.",
        );
      }

      result = retryResult;
    }
  }

  return result.data;
}
