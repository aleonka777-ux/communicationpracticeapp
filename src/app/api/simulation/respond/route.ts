import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireOwnedSession, ApiError } from "@/lib/practice/authorize";
import { appendMessage, listMessages } from "@/lib/db/messages";
import { getToolById } from "@/lib/db/tools";
import { getScenarioById } from "@/lib/db/scenarios";
import { generateInterlocutorTurn } from "@/lib/simulation/engine";
import { AIProviderError } from "@/lib/ai/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { sessionId?: string; message?: string };
    const sessionId = body.sessionId?.trim();
    const message = body.message?.trim();
    if (!sessionId || !message) {
      throw new ApiError(400, "sessionId and message are required.");
    }

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

    await appendMessage(supabase, sessionId, "user", message);
    const priorMessages = await listMessages(supabase, sessionId);

    const replyText = await generateInterlocutorTurn(tool, scenario, priorMessages);
    const replyMessage = await appendMessage(supabase, sessionId, "interlocutor", replyText);

    return NextResponse.json({ reply: replyMessage });
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof AIProviderError) {
      return NextResponse.json({ error: "The other person isn't responding right now. Please try again." }, { status: 502 });
    }
    console.error("simulation/respond failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
