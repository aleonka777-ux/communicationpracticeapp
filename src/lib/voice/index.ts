import "server-only";
import { serverEnv } from "@/lib/env";
import type { SpeechToTextProvider, TextToSpeechProvider } from "@/lib/voice/types";
import { MockSpeechToTextProvider, MockTextToSpeechProvider } from "@/lib/voice/providers/mock";
import { OpenAISpeechToTextProvider, OpenAITextToSpeechProvider } from "@/lib/voice/providers/openai";

let sttCached: SpeechToTextProvider | null = null;
let ttsCached: TextToSpeechProvider | null = null;

export function getSpeechToTextProvider(): SpeechToTextProvider {
  if (sttCached) return sttCached;
  const apiKey = serverEnv.openaiApiKey;
  sttCached = apiKey ? new OpenAISpeechToTextProvider(apiKey) : new MockSpeechToTextProvider();
  return sttCached;
}

export function getTextToSpeechProvider(): TextToSpeechProvider {
  if (ttsCached) return ttsCached;
  const apiKey = serverEnv.openaiApiKey;
  ttsCached = apiKey ? new OpenAITextToSpeechProvider(apiKey) : new MockTextToSpeechProvider();
  return ttsCached;
}

export function isVoiceAvailable(): boolean {
  return Boolean(serverEnv.openaiApiKey);
}
