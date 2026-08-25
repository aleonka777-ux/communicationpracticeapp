import "server-only";
import { getAIProvider } from "@/lib/ai";
import { buildEvaluationSystemPrompt, buildEvaluationUserPrompt, type EvaluationUserPromptInput } from "@/lib/coaching/promptBuilder";
import { evaluationJsonSchema, evaluationLLMOutputSchema, type EvaluationLLMOutput } from "@/lib/coaching/schema";
import { findAllParalinguisticViolations, sanitizeEvaluationOutput, VOCAL_EVIDENCE_AVAILABLE } from "@/lib/coaching/evidenceIntegrity";
import type { CommunicationToolRow } from "@/lib/db/types";

export class EvaluationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EvaluationValidationError";
  }
}

/**
 * Runs the Layer 3 coaching evaluation and validates the structured output (see
 * /docs/ARCHITECTURE.md §6). One controlled retry on schema-validation failure. Throws rather
 * than ever returning/persisting a result that fails schema validation twice (per the build
 * brief's AI-output-validation rule) — the caller (/api/practice/end) already surfaces this as
 * "couldn't generate reliable feedback, please try again" rather than displaying it.
 *
 * Paralinguistic/audio claims (while VOCAL_EVIDENCE_AVAILABLE is false) are handled differently,
 * on purpose: a full regenerate is tried first, but if that STILL leaves a violation, only the
 * specific affected field(s) are sanitized — the whole evaluation is never rejected over this.
 * Production showed rejecting outright meant a user who completed a session lost their entire
 * feedback report over one bad sentence in one dimension's explanation; the fix that matters
 * (never displaying the unsupported claim) doesn't require throwing away everything else.
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
    let violations = findAllParalinguisticViolations(result.data);
    if (violations.length > 0) {
      console.error("[coaching:evaluation] output has unsupported paralinguistic claim(s), regenerating", {
        violations,
      });

      const retryResult = await attempt(
        `Your previous response included a claim about ${violations.map((v) => v.concept).join(", ")} (in ${violations.map((v) => v.field).join(", ")}) — that implies audio or vocal evidence, but you were only given a text transcript with no audio. Rewrite the ENTIRE evaluation without any claim about tone of voice, volume, pace, pauses, hesitation, calmness, demeanor, or emotional state — describe only the wording and language choices actually visible in the transcript.`,
      );

      // A schema-invalid retry can't be used at all — fall back to sanitizing the original,
      // still-valid result rather than throwing over a retry that never should have counted
      // against the user in the first place.
      const candidate = retryResult.success ? retryResult.data : result.data;
      violations = findAllParalinguisticViolations(candidate);

      if (violations.length > 0) {
        console.error(
          "[coaching:evaluation] regenerated output still has unsupported paralinguistic claim(s), sanitizing affected field(s) instead of rejecting",
          { violations },
        );
        const { output, sanitized } = sanitizeEvaluationOutput(candidate);
        console.error("[coaching:evaluation] sanitized field(s)", { sanitized });

        // Sanitization only ever rewrites string content within its field's existing length
        // limit — this should always still satisfy the schema, but re-checking costs nothing and
        // guarantees a corrupted evaluation can never reach the user.
        const sanitizedResult = evaluationLLMOutputSchema.safeParse(output);
        if (!sanitizedResult.success) {
          throw new EvaluationValidationError(
            `Sanitized AI coach output unexpectedly failed schema validation: ${sanitizedResult.error.message}`,
          );
        }
        result = sanitizedResult;
      } else {
        console.error("[coaching:evaluation] regenerated output is clean, no sanitization needed");
        result = { success: true, data: candidate };
      }
    }
  }

  return result.data;
}
