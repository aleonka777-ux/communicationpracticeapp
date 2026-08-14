import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireOwnedSession, ApiError } from "@/lib/practice/authorize";
import { appendMessage, listMessages } from "@/lib/db/messages";
import { getToolById } from "@/lib/db/tools";
import { incrementHintCount } from "@/lib/db/sessions";
import { generateHint } from "@/lib/coaching/hintEngine";
import { AIProviderError } from "@/lib/ai/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { sessionId?: string };
    const sessionId = body.sessionId?.trim();
    if (!sessionId) throw new ApiError(400, "sessionId is required.");

    const supabase = await createClient();
    const { session } = await requireOwnedSession(supabase, sessionId);

    if (session.status !== "in_progress") throw new ApiError(409, "This practice session has already ended.");
    if (session.mode !== "training") throw new ApiError(403, "Hints are only available in Training Mode.");

    const tool = await getToolById(supabase, session.tool_id);
    if (!tool) throw new ApiError(404, "Scenario configuration not found.");

    const recentMessages = await listMessages(supabase, sessionId);
    const hintText = await generateHint(tool, recentMessages);

    await appendMessage(supabase, sessionId, "coach_hint", hintText);
    const hintCount = await incrementHintCount(supabase, sessionId);

    return NextResponse.json({ hint: hintText, hintCount });
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof AIProviderError) {
      return NextResponse.json({ error: "Couldn't get a hint right now. Please try again." }, { status: 502 });
    }
    console.error("simulation/hint failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
