import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireOwnedSession, ApiError } from "@/lib/practice/authorize";
import { getTextToSpeechProvider } from "@/lib/voice";
import { VoiceProviderError } from "@/lib/voice/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { sessionId?: string; text?: string };
    const sessionId = body.sessionId?.trim();
    const text = body.text?.trim();
    if (!sessionId || !text) throw new ApiError(400, "sessionId and text are required.");

    const supabase = await createClient();
    await requireOwnedSession(supabase, sessionId);

    const speech = await getTextToSpeechProvider().synthesize(text);
    return NextResponse.json(speech);
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof VoiceProviderError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    console.error("voice/tts failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Couldn't generate audio right now." }, { status: 500 });
  }
}
