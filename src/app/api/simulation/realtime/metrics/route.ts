import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireOwnedSession, ApiError } from "@/lib/practice/authorize";
import { saveRealtimeTurnEvents, upsertRealtimeSessionMetrics, type RealtimeTurnEventInput } from "@/lib/db/realtimeMetrics";

export const runtime = "nodejs";

/**
 * Persists the objective timing/interruption measurement layer captured client-side by
 * src/lib/realtime/sessionTimeline.ts — never raw audio, only timestamps (ms relative to session
 * start), durations, and small structured metadata. Called best-effort by the client immediately
 * before /api/practice/end; a failure here is logged and must never block or affect that call
 * (see /docs/DECISIONS.md "Realtime timing metrics" — an optional metric write can never cost the
 * user their core transcript or evaluation).
 */

const durationSourceSchema = z.enum(["server_vad", "client_playback"]);
const responseStatusSchema = z.enum(["completed", "cancelled", "failed", "incomplete", "in_progress"]);
const userSpeechClassificationSchema = z.enum(["confirmed", "suspected_noise"]);

const userTurnSchema = z.object({
  // null for a suspected_noise event — it isn't part of the numbered conversation. See
  // src/lib/realtime/sessionTimeline.ts's classification doc comment.
  turnIndex: z.number().int().positive().nullable(),
  classification: userSpeechClassificationSchema,
  itemId: z.string().min(1),
  startMs: z.number(),
  endMs: z.number(),
  durationMs: z.number(),
  durationSource: durationSourceSchema,
  endedBySessionClose: z.boolean(),
  serverAudioStartMs: z.number().nullable(),
  serverAudioEndMs: z.number().nullable(),
  transcript: z.string().nullable(),
  transcriptionFailed: z.boolean(),
});

const aiTurnSchema = z.object({
  turnIndex: z.number().int().positive(),
  responseId: z.string().min(1),
  startMs: z.number(),
  endMs: z.number(),
  durationMs: z.number(),
  wasInterrupted: z.boolean(),
  endedBySessionClose: z.boolean(),
  responseStatus: responseStatusSchema.nullable(),
  transcript: z.string().nullable(),
});

const overlapSchema = z.object({
  startMs: z.number(),
  endMs: z.number(),
  durationMs: z.number(),
  userItemId: z.string().min(1),
  aiResponseId: z.string().min(1),
});

const confirmedBargeInSchema = z.object({
  atMs: z.number(),
  aiResponseId: z.string().nullable(),
});

const sessionMetricsSchema = z.object({
  totalDurationMs: z.number(),
  userTurnCount: z.number().int().nonnegative(),
  aiTurnCount: z.number().int().nonnegative(),
  totalUserSpeakingMs: z.number(),
  totalAiSpeakingMs: z.number(),
  userSpeakingPercentage: z.number(),
  aiSpeakingPercentage: z.number(),
  totalOverlapMs: z.number(),
  overlapCount: z.number().int().nonnegative(),
  confirmedInterruptionCount: z.number().int().nonnegative(),
  suspectedNoiseEventCount: z.number().int().nonnegative(),
  avgUserTurnDurationMs: z.number().nullable(),
  longestUserTurnMs: z.number().nullable(),
  avgAiTurnDurationMs: z.number().nullable(),
  avgUserResponseLatencyMs: z.number().nullable(),
  medianUserResponseLatencyMs: z.number().nullable(),
  longestUserResponseLatencyMs: z.number().nullable(),
  avgAiResponseLatencyMs: z.number().nullable(),
  medianAiResponseLatencyMs: z.number().nullable(),
});

const metricsPayloadSchema = z.object({
  sessionId: z.string().min(1),
  userTurns: z.array(userTurnSchema),
  aiTurns: z.array(aiTurnSchema),
  overlaps: z.array(overlapSchema),
  confirmedBargeIns: z.array(confirmedBargeInSchema),
  session: sessionMetricsSchema,
});

export async function POST(request: Request) {
  try {
    const body = metricsPayloadSchema.parse(await request.json());
    const { sessionId } = body;

    const supabase = await createClient();
    const { session } = await requireOwnedSession(supabase, sessionId);
    if (session.status === "completed" || session.status === "abandoned") {
      throw new ApiError(409, "This practice session has already been finalized.");
    }

    const events: RealtimeTurnEventInput[] = [
      ...body.userTurns.map(
        (t): RealtimeTurnEventInput => ({
          kind: "user_turn",
          turn_index: t.turnIndex,
          start_ms: t.startMs,
          end_ms: t.endMs,
          duration_ms: t.durationMs,
          duration_source: t.durationSource,
          server_audio_start_ms: t.serverAudioStartMs,
          server_audio_end_ms: t.serverAudioEndMs,
          was_interrupted: null,
          ended_by_session_close: t.endedBySessionClose,
          response_status: null,
          realtime_item_id: t.itemId,
          realtime_response_id: null,
          message_id: null,
          user_turn_classification: t.classification,
          transcription_failed: t.transcriptionFailed,
          metadata: {},
        }),
      ),
      ...body.aiTurns.map(
        (t): RealtimeTurnEventInput => ({
          kind: "ai_turn",
          turn_index: t.turnIndex,
          start_ms: t.startMs,
          end_ms: t.endMs,
          duration_ms: t.durationMs,
          duration_source: "client_playback",
          server_audio_start_ms: null,
          server_audio_end_ms: null,
          was_interrupted: t.wasInterrupted,
          ended_by_session_close: t.endedBySessionClose,
          response_status: t.responseStatus,
          realtime_item_id: null,
          realtime_response_id: t.responseId,
          message_id: null,
          user_turn_classification: null,
          transcription_failed: null,
          metadata: {},
        }),
      ),
      ...body.overlaps.map(
        (o): RealtimeTurnEventInput => ({
          kind: "overlap",
          turn_index: null,
          start_ms: o.startMs,
          end_ms: o.endMs,
          duration_ms: o.durationMs,
          duration_source: null,
          server_audio_start_ms: null,
          server_audio_end_ms: null,
          was_interrupted: null,
          ended_by_session_close: null,
          response_status: null,
          realtime_item_id: o.userItemId,
          realtime_response_id: o.aiResponseId,
          message_id: null,
          user_turn_classification: null,
          transcription_failed: null,
          metadata: {},
        }),
      ),
      ...body.confirmedBargeIns.map(
        (b): RealtimeTurnEventInput => ({
          kind: "confirmed_barge_in",
          turn_index: null,
          start_ms: b.atMs,
          end_ms: null,
          duration_ms: null,
          duration_source: null,
          server_audio_start_ms: null,
          server_audio_end_ms: null,
          was_interrupted: null,
          ended_by_session_close: null,
          response_status: null,
          realtime_item_id: null,
          realtime_response_id: b.aiResponseId,
          message_id: null,
          user_turn_classification: null,
          transcription_failed: null,
          metadata: {},
        }),
      ),
    ];

    await saveRealtimeTurnEvents(supabase, sessionId, events);
    await upsertRealtimeSessionMetrics(supabase, sessionId, {
      total_duration_ms: body.session.totalDurationMs,
      user_turn_count: body.session.userTurnCount,
      ai_turn_count: body.session.aiTurnCount,
      total_user_speaking_ms: body.session.totalUserSpeakingMs,
      total_ai_speaking_ms: body.session.totalAiSpeakingMs,
      user_speaking_percentage: body.session.userSpeakingPercentage,
      ai_speaking_percentage: body.session.aiSpeakingPercentage,
      total_overlap_ms: body.session.totalOverlapMs,
      overlap_count: body.session.overlapCount,
      confirmed_interruption_count: body.session.confirmedInterruptionCount,
      suspected_noise_event_count: body.session.suspectedNoiseEventCount,
      avg_user_turn_duration_ms: body.session.avgUserTurnDurationMs,
      longest_user_turn_ms: body.session.longestUserTurnMs,
      avg_ai_turn_duration_ms: body.session.avgAiTurnDurationMs,
      avg_user_response_latency_ms: body.session.avgUserResponseLatencyMs,
      median_user_response_latency_ms: body.session.medianUserResponseLatencyMs,
      longest_user_response_latency_ms: body.session.longestUserResponseLatencyMs,
      avg_ai_response_latency_ms: body.session.avgAiResponseLatencyMs,
      median_ai_response_latency_ms: body.session.medianAiResponseLatencyMs,
    });

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
