import "server-only";
import { serverEnv } from "@/lib/env";
import type { AIProvider } from "@/lib/ai/types";
import { MockAIProvider } from "@/lib/ai/providers/mock";
import { OpenAIProvider } from "@/lib/ai/providers/openai";

let cached: AIProvider | null = null;

/**
 * Returns the configured AIProvider. Falls back to the deterministic mock automatically when
 * OPENAI_API_KEY is absent (see /docs/DECISIONS.md) — callers can check `.name` if they need to
 * show a "demo mode" indicator.
 */
export function getAIProvider(): AIProvider {
  if (cached) return cached;
  const apiKey = serverEnv.openaiApiKey;
  cached = apiKey ? new OpenAIProvider(apiKey) : new MockAIProvider();
  return cached;
}
