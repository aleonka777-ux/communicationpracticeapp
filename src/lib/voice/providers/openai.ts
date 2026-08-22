import "server-only";
import OpenAI, { toFile } from "openai";
import type { SpeechResult, SpeechToTextProvider, TextToSpeechProvider, TranscriptionResult } from "@/lib/voice/types";
import { VoiceProviderError } from "@/lib/voice/types";
import { classifyOpenAIError } from "@/lib/voice/errorClassification";

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
      if (!text) {
        throw new VoiceProviderError("No speech was detected in that recording.", "bad_request");
      }
      return { text };
    } catch (error) {
      if (error instanceof VoiceProviderError) throw error;
      const classified = classifyOpenAIError(error);
      console.error("[voice:stt] OpenAI transcription request failed", {
        code: classified.code,
        status: classified.status,
        providerCode: classified.providerCode,
        requestId: classified.requestId,
        model: TRANSCRIBE_MODEL,
      });
      throw new VoiceProviderError(`OpenAI transcription request failed (${classified.code}).`, classified.code, error);
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
      const classified = classifyOpenAIError(error);
      console.error("[voice:tts] OpenAI speech synthesis request failed", {
        code: classified.code,
        status: classified.status,
        providerCode: classified.providerCode,
        requestId: classified.requestId,
        model: TTS_MODEL,
        voice: TTS_VOICE,
      });
      throw new VoiceProviderError(`OpenAI speech synthesis request failed (${classified.code}).`, classified.code, error);
    }
  }
}
