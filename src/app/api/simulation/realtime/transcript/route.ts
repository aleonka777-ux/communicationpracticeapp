import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireOwnedSession, ApiError } from "@/lib/practice/authorize";
import { appendMessage } from "@/lib/db/messages";
import type { MessageSpeaker } from "@/lib/db/types";

export const runtime = "nodejs";

const ALLOWED_SPEAKERS: MessageSpeaker[] = ["user", "interlocutor"];

/**
 * Persists one completed turn's transcript into the existing conversation_messages structure
 * while a Realtime session is live — audio itself flows client<->OpenAI directly over WebRTC and
 * never touches our server, but the transcript still needs to land in Supabase exactly like the
 * batch flow's, so the post-session Evaluation Engine (src/lib/coaching) works unchanged.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { sessionId?: string; speaker?: string; text?: string };
    const sessionId = body.sessionId?.trim();
    const text = body.text?.trim();
    const speaker = body.speaker as MessageSpeaker | undefined;

    if (!sessionId || !text || !speaker || !ALLOWED_SPEAKERS.includes(speaker)) {
      throw new ApiError(400, "sessionId, a valid speaker, and text are required.");
    }

    const supabase = await createClient();
    const { session } = await requireOwnedSession(supabase, sessionId);

    if (session.status !== "in_progress") {
      throw new ApiError(409, "This practice session has already ended.");
    }

    const message = await appendMessage(supabase, sessionId, speaker, text);
    return NextResponse.json({ message });
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[voice:realtime] transcript persistence failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Couldn't save that part of the conversation." }, { status: 500 });
  }
}
