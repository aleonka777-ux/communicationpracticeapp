import "server-only";
import OpenAI, { toFile } from "openai";
import type { SpeechResult, SpeechToTextProvider, TextToSpeechProvider, TranscriptionResult } from "@/lib/voice/types";
import { VoiceProviderError } from "@/lib/voice/types";

const TRANSCRIBE_MODEL = process.env.OPENAI_TRANSCRIBE_MODEL ?? "whisper-1";
const TTS_MODEL = process.env.OPENAI_TTS_MODEL ?? "tts-1";
const TTS_VOICE = (process.env.OPENAI_TTS_VOICE ?? "alloy") as "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer";

export class OpenAISpeechToTextProvider implements SpeechToTextProvider {
  readonly name = "openai";
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async transcribe(audio: Buffer, mimeType: string): Promise<TranscriptionResult> {
    try {
      const extension = mimeType.includes("webm") ? "webm" : mimeType.includes("mp4") ? "mp4" : "wav";
      const file = await toFile(audio, `recording.${extension}`, { type: mimeType });
      const result = await this.client.audio.transcriptions.create({
        file,
        model: TRANSCRIBE_MODEL,
      });
      const text = result.text?.trim();
      if (!text) throw new VoiceProviderError("Transcription returned no text.");
      return { text };
    } catch (error) {
      if (error instanceof VoiceProviderError) throw error;
      throw new VoiceProviderError("Speech-to-text request failed.", error);
    }
  }
}

export class OpenAITextToSpeechProvider implements TextToSpeechProvider {
  readonly name = "openai";
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async synthesize(text: string): Promise<SpeechResult> {
    try {
      const response = await this.client.audio.speech.create({
        model: TTS_MODEL,
        voice: TTS_VOICE,
        input: text,
        response_format: "mp3",
      });
      const arrayBuffer = await response.arrayBuffer();
      return { audioBase64: Buffer.from(arrayBuffer).toString("base64"), mimeType: "audio/mpeg" };
    } catch (error) {
      throw new VoiceProviderError("Text-to-speech request failed.", error);
    }
  }
}
