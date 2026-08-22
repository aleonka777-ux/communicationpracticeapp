import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireOwnedSession, ApiError } from "@/lib/practice/authorize";
import { getSpeechToTextProvider } from "@/lib/voice";
import { VoiceProviderError } from "@/lib/voice/types";
import { voiceErrorResponseBody } from "@/lib/voice/errorResponse";

export const runtime = "nodejs";

const MAX_AUDIO_BYTES = 15 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const sessionId = String(formData.get("sessionId") ?? "").trim();
    const audio = formData.get("audio");
    if (!sessionId || !(audio instanceof Blob)) {
      throw new ApiError(400, "sessionId and an audio file are required.");
    }
    if (audio.size === 0) throw new ApiError(400, "The recording was empty. Please try again.");
    if (audio.size > MAX_AUDIO_BYTES) throw new ApiError(413, "That recording is too long.");

    const supabase = await createClient();
    await requireOwnedSession(supabase, sessionId);

    const buffer = Buffer.from(await audio.arrayBuffer());
    const mimeType = audio.type || "audio/webm";

    const { text } = await getSpeechToTextProvider().transcribe(buffer, mimeType);
    return NextResponse.json({ text });
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof VoiceProviderError) {
      const { status, ...body } = voiceErrorResponseBody(error.code);
      return NextResponse.json(body, { status });
    }
    console.error("[voice:stt] unexpected route failure", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: "Couldn't transcribe that. Please try typing instead.", code: "unknown" },
      { status: 500 },
    );
  }
}
