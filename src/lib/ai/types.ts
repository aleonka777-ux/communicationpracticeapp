/**
 * AIProvider: the one interface every AI-backed feature (interlocutor replies, hints,
 * evaluation) calls through. Concrete implementations live in src/lib/ai/providers and are never
 * imported directly outside src/lib/ai/index.ts — see /docs/ARCHITECTURE.md §11.
 *
 * Prompt construction (what goes into systemPrompt/messages/userPrompt) is entirely the
 * responsibility of src/lib/simulation and src/lib/coaching. Providers just execute a request.
 */

export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface InterlocutorReplyInput {
  systemPrompt: string;
  messages: ChatMessage[];
}

export interface InterlocutorReplyOutput {
  text: string;
}

export interface HintInput {
  systemPrompt: string;
  messages: ChatMessage[];
}

export interface HintOutput {
  text: string;
}

export interface EvaluationInput {
  systemPrompt: string;
  userPrompt: string;
  /** JSON Schema the structured output must conform to. */
  jsonSchema: Record<string, unknown>;
  schemaName: string;
}

export interface EvaluationOutput {
  /** Unvalidated parsed JSON — the caller (src/lib/coaching) validates this with zod. */
  raw: unknown;
}

export interface AIProvider {
  readonly name: string;
  generateInterlocutorReply(input: InterlocutorReplyInput): Promise<InterlocutorReplyOutput>;
  generateHint(input: HintInput): Promise<HintOutput>;
  generateEvaluation(input: EvaluationInput): Promise<EvaluationOutput>;
}

export class AIProviderError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "AIProviderError";
  }
}
