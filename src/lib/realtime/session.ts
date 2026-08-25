import "server-only";
import OpenAI from "openai";
import { serverEnv } from "@/lib/env";
import { buildInterlocutorSystemPrompt } from "@/lib/simulation/promptBuilder";
import { classifyOpenAIError } from "@/lib/voice/errorClassification";
import { VoiceProviderError } from "@/lib/voice/types";
import type { CommunicationToolRow, ScenarioRow } from "@/lib/db/types";

export interface RealtimeClientCredential {
  clientSecret: string;
  expiresAt: number;
  model: string;
}

/**
 * Mints a short-lived Realtime client secret scoped to one practice session's character —
 * the browser connects to OpenAI directly with this, so OPENAI_API_KEY itself never leaves the
 * server. Instructions reuse the existing Layer 2 prompt builder unchanged (see
 * /docs/ARCHITECTURE.md §6) — the interlocutor's character definition is identical whether it's
 * driven by the batch engine or Realtime.
 */
export async function createRealtimeClientCredential(
  tool: CommunicationToolRow,
  scenario: ScenarioRow,
): Promise<RealtimeClientCredential> {
  const apiKey = serverEnv.openaiApiKey;
  if (!apiKey) {
    throw new VoiceProviderError("Realtime voice requires OPENAI_API_KEY to be configured.", "not_configured");
  }

  const client = new OpenAI({ apiKey });
  const model = serverEnv.realtimeModel;

  try {
    const clientSecret = await client.realtime.clientSecrets.create({
      expires_after: { anchor: "created_at", seconds: 600 },
      session: {
        type: "realtime",
        model,
        instructions: buildInterlocutorSystemPrompt(tool, scenario),
        output_modalities: ["audio"],
        audio: {
          input: {
            transcription: { model: "whisper-1" },
            turn_detection: {
              type: "server_vad",
              create_response: true,
              interrupt_response: true,
            },
          },
          output: {
            voice: serverEnv.realtimeVoice,
          },
        },
      },
    });

    return { clientSecret: clientSecret.value, expiresAt: clientSecret.expires_at, model };
  } catch (error) {
    if (error instanceof VoiceProviderError) throw error;
    const classified = classifyOpenAIError(error);
    console.error("[voice:realtime] failed to mint client secret", {
      code: classified.code,
      status: classified.status,
      providerCode: classified.providerCode,
      requestId: classified.requestId,
      model,
    });
    throw new VoiceProviderError(`Realtime session setup failed (${classified.code}).`, classified.code, error);
  }
}
