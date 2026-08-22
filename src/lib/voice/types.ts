/**
 * Voice provider abstractions (see /docs/ARCHITECTURE.md §9). Concrete implementations live in
 * src/lib/voice/providers and are only ever constructed via src/lib/voice/index.ts.
 */

export interface TranscriptionResult {
  text: string;
}

export interface SpeechToTextProvider {
  readonly name: string;
  transcribe(audio: Buffer, mimeType: string): Promise<TranscriptionResult>;
}

export interface SpeechResult {
  audioBase64: string;
  mimeType: string;
}

export interface TextToSpeechProvider {
  readonly name: string;
  synthesize(text: string): Promise<SpeechResult>;
}

/**
 * Closed set of failure categories a voice request can fall into. Used to decide what to tell
 * the user and, critically, whether voice should stay enabled for the rest of the session —
 * only `not_configured` (no provider at all) should ever disable it; every other category is a
 * single failed attempt and must remain retryable. See /docs/DECISIONS.md "Voice error handling".
 */
export type VoiceErrorCode =
  | "not_configured"
  | "invalid_api_key"
  | "insufficient_quota"
  | "rate_limited"
  | "model_unavailable"
  | "permission_denied"
  | "bad_request"
  | "network_error"
  | "provider_unavailable"
  | "unknown";

export class VoiceProviderError extends Error {
  constructor(
    message: string,
    public readonly code: VoiceErrorCode,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "VoiceProviderError";
  }
}
