import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireOwnedSession, ApiError } from "@/lib/practice/authorize";
import { getToolById } from "@/lib/db/tools";
import { getScenarioById } from "@/lib/db/scenarios";
import { createRealtimeClientCredential } from "@/lib/realtime/session";
import { VoiceProviderError } from "@/lib/voice/types";
import { voiceErrorResponseBody } from "@/lib/voice/errorResponse";

export const runtime = "nodejs";

/**
 * Mints a short-lived Realtime client secret for one practice session. The browser connects to
 * OpenAI directly with the returned secret over WebRTC (src/lib/realtime/webrtcClient.ts) —
 * OPENAI_API_KEY itself is never sent to the client.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { sessionId?: string };
    const sessionId = body.sessionId?.trim();
    if (!sessionId) throw new ApiError(400, "sessionId is required.");

    const supabase = await createClient();
    const { session } = await requireOwnedSession(supabase, sessionId);

    if (session.status !== "in_progress") {
      throw new ApiError(409, "This practice session has already ended.");
    }

    const [tool, scenario] = await Promise.all([
      getToolById(supabase, session.tool_id),
      getScenarioById(supabase, session.scenario_id),
    ]);
    if (!tool || !scenario) throw new ApiError(404, "Scenario configuration not found.");

    const credential = await createRealtimeClientCredential(tool, scenario);

    return NextResponse.json({
      clientSecret: credential.clientSecret,
      expiresAt: credential.expiresAt,
      model: credential.model,
      openingLine: scenario.opening_line,
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof VoiceProviderError) {
      const { status, ...responseBody } = voiceErrorResponseBody(error.code);
      return NextResponse.json(responseBody, { status });
    }
    console.error("[voice:realtime] unexpected session route failure", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: "Couldn't start the voice conversation. Please try again.", code: "unknown" },
      { status: 500 },
    );
  }
}
