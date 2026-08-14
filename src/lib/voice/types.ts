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

export class VoiceProviderError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "VoiceProviderError";
  }
}
