import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireOwnedSession, ApiError } from "@/lib/practice/authorize";
import {
  saveRealtimeDisfluencyCandidates,
  saveRealtimePauseEvents,
  saveRealtimeTurnEvents,
  upsertRealtimeSessionMetrics,
} from "@/lib/db/realtimeMetrics";
import { computeAndPersistSemanticResponses } from "@/lib/db/semanticResponses";
import {
  mapMetricsPayloadToFillerCandidates,
  mapMetricsPayloadToPauseEvents,
  mapMetricsPayloadToSessionMetrics,
  mapMetricsPayloadToTurnEvents,
  metricsPayloadSchema,
} from "@/lib/realtime/metricsPayload";

export const runtime = "nodejs";

/**
 * Persists the objective timing/interruption measurement layer captured client-side by
 * src/lib/realtime/sessionTimeline.ts, plus the Phase 4A speech-delivery evidence layer
 * (src/lib/realtime/speechDeliveryTracker.ts + fillerCandidates.ts) — never raw audio, only
 * timestamps (ms relative to session start), durations, word/candidate counts, and relative
 * (unitless) intensity scalars. Called best-effort by the client immediately before
 * /api/practice/end; a failure here is logged and must never block or affect that call (see
 * /docs/DECISIONS.md — an optional metric write can never cost the user their core transcript or
 * evaluation). Validation schema and DB-row mapping live in src/lib/realtime/metricsPayload.ts so
 * they're directly unit-testable.
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
    await saveRealtimePauseEvents(supabase, sessionId, mapMetricsPayloadToPauseEvents(body));
    await saveRealtimeDisfluencyCandidates(supabase, sessionId, mapMetricsPayloadToFillerCandidates(body));
    await upsertRealtimeSessionMetrics(supabase, sessionId, mapMetricsPayloadToSessionMetrics(body));

    // Phase 4B.1A: derived, failure-isolated analytics layer. Deliberately isolated in its own
    // try/catch, exactly like the Phase 4A speech-delivery merge in realtime-simulation-client.tsx
    // — a grouping failure must never affect the raw metrics this request already successfully
    // persisted, nor this response, nor the client's subsequent /api/practice/end call. Not yet
    // read by the Evaluation Engine or any production UI (see /docs/DECISIONS.md).
    try {
      await computeAndPersistSemanticResponses(supabase, sessionId);
    } catch (error) {
      console.error("[semantic-response] compute/persist failed (raw metrics unaffected)", error instanceof Error ? error.message : error);
    }

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
