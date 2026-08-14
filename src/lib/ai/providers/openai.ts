import "server-only";
import OpenAI from "openai";
import type {
  AIProvider,
  EvaluationInput,
  EvaluationOutput,
  HintInput,
  HintOutput,
  InterlocutorReplyInput,
  InterlocutorReplyOutput,
} from "@/lib/ai/types";
import { AIProviderError } from "@/lib/ai/types";

const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL ?? "gpt-4o-mini";

/**
 * OpenAI implementation of AIProvider using the Chat Completions API (stable, "supported
 * indefinitely" per the OpenAI SDK docs). Model is configurable via OPENAI_CHAT_MODEL —
 * see /docs/DECISIONS.md for why a conservative default was chosen over guessing at newer
 * model names.
 */
export class OpenAIProvider implements AIProvider {
  readonly name = "openai";
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async generateInterlocutorReply(input: InterlocutorReplyInput): Promise<InterlocutorReplyOutput> {
    try {
      const completion = await this.client.chat.completions.create({
        model: CHAT_MODEL,
        temperature: 0.8,
        max_tokens: 200,
        messages: [
          { role: "system", content: input.systemPrompt },
          ...input.messages.map((m) => ({ role: m.role, content: m.content })),
        ],
      });
      const text = completion.choices[0]?.message?.content?.trim();
      if (!text) throw new AIProviderError("OpenAI returned an empty interlocutor reply.");
      return { text };
    } catch (error) {
      if (error instanceof AIProviderError) throw error;
      throw new AIProviderError("Failed to generate interlocutor reply.", error);
    }
  }

  async generateHint(input: HintInput): Promise<HintOutput> {
    try {
      const completion = await this.client.chat.completions.create({
        model: CHAT_MODEL,
        temperature: 0.5,
        max_tokens: 80,
        messages: [
          { role: "system", content: input.systemPrompt },
          ...input.messages.map((m) => ({ role: m.role, content: m.content })),
        ],
      });
      const text = completion.choices[0]?.message?.content?.trim();
      if (!text) throw new AIProviderError("OpenAI returned an empty hint.");
      return { text };
    } catch (error) {
      if (error instanceof AIProviderError) throw error;
      throw new AIProviderError("Failed to generate hint.", error);
    }
  }

  async generateEvaluation(input: EvaluationInput): Promise<EvaluationOutput> {
    try {
      const completion = await this.client.chat.completions.create({
        model: CHAT_MODEL,
        temperature: 0.3,
        max_tokens: 1800,
        messages: [
          { role: "system", content: input.systemPrompt },
          { role: "user", content: input.userPrompt },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: input.schemaName, schema: input.jsonSchema, strict: true },
        },
      });
      const content = completion.choices[0]?.message?.content;
      if (!content) throw new AIProviderError("OpenAI returned an empty evaluation.");
      let raw: unknown;
      try {
        raw = JSON.parse(content);
      } catch (parseError) {
        throw new AIProviderError("OpenAI evaluation response was not valid JSON.", parseError);
      }
      return { raw };
    } catch (error) {
      if (error instanceof AIProviderError) throw error;
      throw new AIProviderError("Failed to generate evaluation.", error);
    }
  }
}
