import type { SpeechResult, SpeechToTextProvider, TextToSpeechProvider, TranscriptionResult } from "@/lib/voice/types";
import { VoiceProviderError } from "@/lib/voice/types";

/**
 * Used automatically when no OPENAI_API_KEY is configured. Deliberately throws rather than
 * faking audio/transcription — voice is disabled and the UI falls back to typed input with a
 * clear explanation, per /docs/DECISIONS.md ("do not pretend mock audio is production voice").
 */
export class MockSpeechToTextProvider implements SpeechToTextProvider {
  readonly name = "mock";

  async transcribe(): Promise<TranscriptionResult> {
    throw new VoiceProviderError("Voice input isn't available in demo mode — configure OPENAI_API_KEY to enable it.");
  }
}

export class MockTextToSpeechProvider implements TextToSpeechProvider {
  readonly name = "mock";

  async synthesize(): Promise<SpeechResult> {
    throw new VoiceProviderError("Voice playback isn't available in demo mode — configure OPENAI_API_KEY to enable it.");
  }
}
