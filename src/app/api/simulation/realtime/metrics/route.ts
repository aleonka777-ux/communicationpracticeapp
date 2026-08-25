import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireOwnedSession, ApiError } from "@/lib/practice/authorize";
import { saveRealtimeTurnEvents, upsertRealtimeSessionMetrics } from "@/lib/db/realtimeMetrics";
import { mapMetricsPayloadToSessionMetrics, mapMetricsPayloadToTurnEvents, metricsPayloadSchema } from "@/lib/realtime/metricsPayload";

export const runtime = "nodejs";

/**
 * Persists the objective timing/interruption measurement layer captured client-side by
 * src/lib/realtime/sessionTimeline.ts — never raw audio, only timestamps (ms relative to session
 * start), durations, and small structured metadata. Called best-effort by the client immediately
 * before /api/practice/end; a failure here is logged and must never block or affect that call
 * (see /docs/DECISIONS.md "Realtime timing metrics" — an optional metric write can never cost the
 * user their core transcript or evaluation). Validation schema and DB-row mapping live in
 * src/lib/realtime/metricsPayload.ts so they're directly unit-testable.
 */

export async function POST(request: Request) {
  try {
    const body = metricsPayloadSchema.parse(await request.json());
    const { sessionId } = body;

    const supabase = await createClient();
    const { session } = await requireOwnedSession(supabase, sessionId);
    if (session.status === "completed" || session.status === "abandoned") {
      throw new ApiError(409, "This practice session has already been finalized.");
    }

    await saveRealtimeTurnEvents(supabase, sessionId, mapMetricsPayloadToTurnEvents(body));
    await upsertRealtimeSessionMetrics(supabase, sessionId, mapMetricsPayloadToSessionMetrics(body));

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid metrics payload." }, { status: 400 });
    }
    console.error("[voice:realtime] timing metrics persistence failed (transcript/evaluation unaffected)", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Couldn't save timing metrics." }, { status: 500 });
  }
}
