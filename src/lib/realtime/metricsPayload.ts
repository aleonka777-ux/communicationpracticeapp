import { z } from "zod";
import type {
  RealtimeDisfluencyCandidateInput,
  RealtimePauseEventInput,
  RealtimeSessionMetricsInput,
  RealtimeTurnEventInput,
} from "@/lib/db/realtimeMetrics";

/**
 * Validation + DB-row mapping for the objective timing/interruption measurement layer POSTed to
 * /api/simulation/realtime/metrics by src/lib/realtime/sessionTimeline.ts. Kept separate from the
 * route handler (same pattern as src/lib/coaching/schema.ts) so it's directly unit-testable.
 *
 * None of the ms/duration/percentage fields below are `.int()` — they are derived from the
 * client's monotonic clock (performance.now(), inherently fractional) or arithmetic over it
 * (durations, sums, averages, medians), and are persisted into `double precision` columns (see
 * supabase/migrations/0010_fix_realtime_metric_numeric_types.sql). Only genuine whole-number
 * fields (turn indices, counts) use `.int()`.
 */

const durationSourceSchema = z.enum(["server_vad", "client_playback"]);
const responseStatusSchema = z.enum(["completed", "cancelled", "failed", "incomplete", "in_progress"]);
const userSpeechClassificationSchema = z.enum(["confirmed", "suspected_noise"]);
const bargeInContextSchema = z.enum(["audible", "pre_playback"]);
const fillerCandidateCategorySchema = z.enum(["vocal_disfluency_candidate", "lexical_discourse_candidate", "repetition_candidate"]);
const pausePositionBucketSchema = z.enum(["beginning", "middle", "end"]);

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
  // Snapshotted at speech-start time, not re-derived later — see
  // src/lib/realtime/sessionTimeline.ts's doc comment on classifying audible-vs-pre_playback at
  // speech-start time.
  audibleAiResponseIdAtStart: z.string().nullable(),
  // Phase 4A speech-delivery evidence — see sessionTimeline.ts's UserTurnMetric doc comments.
  wordCount: z.number().int().nonnegative().nullable(),
  speakingRateWpm: z.number().nullable(),
  // Populated client-side from src/lib/realtime/speechDeliveryTracker.ts's per-turn aggregate,
  // merged in by realtime-simulation-client.tsx by itemId — null for a turn the tracker never saw
  // a sample for (e.g. mic energy monitor failed to start; never blocks the rest of the payload).
  avgRelativeIntensity: z.number().nullable(),
  peakRelativeIntensity: z.number().nullable(),
  intensityVariability: z.number().nullable(),
});

const pauseEventSchema = z.object({
  itemId: z.string().min(1),
  startMs: z.number(),
  durationMs: z.number(),
  positionRatio: z.number().min(0).max(1),
  positionBucket: pausePositionBucketSchema,
});

const fillerCandidateSchema = z.object({
  itemId: z.string().min(1),
  turnIndex: z.number().int().positive(),
  category: fillerCandidateCategorySchema,
  // Always "unclassified" today — see fillerCandidates.ts's doc comment. A literal, not the general
  // enum, so this schema itself enforces "candidates, not judgments" for Phase 4A.
  classification: z.literal("unclassified"),
  phrase: z.string().min(1),
  transcriptStartChar: z.number().int().nonnegative(),
  transcriptEndChar: z.number().int().nonnegative(),
  contextBefore: z.string(),
  contextAfter: z.string(),
  approxSessionMs: z.number().nullable(),
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
  // "audible": AI audio was actually playing. "pre_playback": a real technical barge-in that
  // cancelled a response before it ever produced audio — not an audible interruption. See
  // src/lib/realtime/sessionTimeline.ts's doc comment.
  context: bargeInContextSchema,
  // False for a repeat confirmation against an AI response already counted as interrupted, or for
  // a pre_playback context — see sessionTimeline.ts's doc comment on idempotent audible interruption.
  countsTowardInterruption: z.boolean(),
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
  // Coaching-facing: audible interruptions only (context: "audible").
  confirmedInterruptionCount: z.number().int().nonnegative(),
  // Diagnostic total: every confirmed barge-in regardless of context.
  technicalBargeInCount: z.number().int().nonnegative(),
  suspectedNoiseEventCount: z.number().int().nonnegative(),
  avgUserTurnDurationMs: z.number().nullable(),
  longestUserTurnMs: z.number().nullable(),
  avgAiTurnDurationMs: z.number().nullable(),
  avgUserResponseLatencyMs: z.number().nullable(),
  medianUserResponseLatencyMs: z.number().nullable(),
  longestUserResponseLatencyMs: z.number().nullable(),
  avgAiResponseLatencyMs: z.number().nullable(),
  medianAiResponseLatencyMs: z.number().nullable(),
  // Phase 4A speech-delivery evidence — see sessionTimeline.ts's SessionLevelMetrics doc comments.
  avgWordsPerMinute: z.number().nullable(),
  medianWordsPerMinute: z.number().nullable(),
  fastestUserTurnWpm: z.number().nullable(),
  slowestUserTurnWpm: z.number().nullable(),
  wpmTrendSlopePerTurn: z.number().nullable(),
  vocalDisfluencyCandidateCount: z.number().int().nonnegative(),
  lexicalDiscourseCandidateCount: z.number().int().nonnegative(),
  repetitionCandidateCount: z.number().int().nonnegative(),
  candidateRatePer100Words: z.number().nullable(),
  candidateRatePerMinuteSpeaking: z.number().nullable(),
  // Populated client-side from speechDeliveryTracker.ts's finalize() — see the pause/intensity
  // session aggregate doc comments there for threshold/calibration rationale.
  intraPauseCount: z.number().int().nonnegative(),
  totalIntraPauseMs: z.number(),
  avgIntraPauseMs: z.number().nullable(),
  medianIntraPauseMs: z.number().nullable(),
  longestIntraPauseMs: z.number().nullable(),
  pausesPerMinuteSpeaking: z.number().nullable(),
});

export const metricsPayloadSchema = z.object({
  sessionId: z.string().min(1),
  userTurns: z.array(userTurnSchema),
  aiTurns: z.array(aiTurnSchema),
  overlaps: z.array(overlapSchema),
  confirmedBargeIns: z.array(confirmedBargeInSchema),
  pauses: z.array(pauseEventSchema),
  fillerCandidates: z.array(fillerCandidateSchema),
  session: sessionMetricsSchema,
});

export type MetricsPayload = z.infer<typeof metricsPayloadSchema>;

/**
 * Maps a validated payload into the flat per-event rows realtime_turn_events stores. Every
 * ms-valued field is passed through untouched — no rounding — since the destination columns are
 * double precision specifically to hold this fractional client-clock data as-is.
 */
export function mapMetricsPayloadToTurnEvents(body: MetricsPayload): RealtimeTurnEventInput[] {
  return [
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
        barge_in_context: null,
        counts_toward_interruption: null,
        audible_ai_response_id_at_start: t.audibleAiResponseIdAtStart,
        word_count: t.wordCount,
        speaking_rate_wpm: t.speakingRateWpm,
        avg_relative_intensity: t.avgRelativeIntensity,
        peak_relative_intensity: t.peakRelativeIntensity,
        intensity_variability: t.intensityVariability,
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
        barge_in_context: null,
        counts_toward_interruption: null,
        audible_ai_response_id_at_start: null,
        word_count: null,
        speaking_rate_wpm: null,
        avg_relative_intensity: null,
        peak_relative_intensity: null,
        intensity_variability: null,
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
        barge_in_context: null,
        counts_toward_interruption: null,
        audible_ai_response_id_at_start: null,
        word_count: null,
        speaking_rate_wpm: null,
        avg_relative_intensity: null,
        peak_relative_intensity: null,
        intensity_variability: null,
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
        barge_in_context: b.context,
        counts_toward_interruption: b.countsTowardInterruption,
        audible_ai_response_id_at_start: null,
        word_count: null,
        speaking_rate_wpm: null,
        avg_relative_intensity: null,
        peak_relative_intensity: null,
        intensity_variability: null,
        metadata: {},
      }),
    ),
  ];
}

/** Maps a validated payload's intra-utterance pause evidence to realtime_pause_events rows. */
export function mapMetricsPayloadToPauseEvents(body: MetricsPayload): RealtimePauseEventInput[] {
  return body.pauses.map((p) => ({
    realtime_item_id: p.itemId,
    start_ms: p.startMs,
    duration_ms: p.durationMs,
    position_ratio: p.positionRatio,
    position_bucket: p.positionBucket,
  }));
}

/** Maps a validated payload's filler/disfluency candidates to realtime_disfluency_candidates rows. */
export function mapMetricsPayloadToFillerCandidates(body: MetricsPayload): RealtimeDisfluencyCandidateInput[] {
  return body.fillerCandidates.map((c) => ({
    realtime_item_id: c.itemId,
    turn_index: c.turnIndex,
    category: c.category,
    classification: c.classification,
    phrase: c.phrase,
    transcript_start_char: c.transcriptStartChar,
    transcript_end_char: c.transcriptEndChar,
    context_before: c.contextBefore,
    context_after: c.contextAfter,
    approx_session_ms: c.approxSessionMs,
  }));
}

/** Maps a validated payload's session-level aggregates to the realtime_session_metrics row shape. */
export function mapMetricsPayloadToSessionMetrics(body: MetricsPayload): RealtimeSessionMetricsInput {
  return {
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
    technical_barge_in_count: body.session.technicalBargeInCount,
    suspected_noise_event_count: body.session.suspectedNoiseEventCount,
    avg_user_turn_duration_ms: body.session.avgUserTurnDurationMs,
    longest_user_turn_ms: body.session.longestUserTurnMs,
    avg_ai_turn_duration_ms: body.session.avgAiTurnDurationMs,
    avg_user_response_latency_ms: body.session.avgUserResponseLatencyMs,
    median_user_response_latency_ms: body.session.medianUserResponseLatencyMs,
    longest_user_response_latency_ms: body.session.longestUserResponseLatencyMs,
    avg_ai_response_latency_ms: body.session.avgAiResponseLatencyMs,
    median_ai_response_latency_ms: body.session.medianAiResponseLatencyMs,
    avg_words_per_minute: body.session.avgWordsPerMinute,
    median_words_per_minute: body.session.medianWordsPerMinute,
    fastest_user_turn_wpm: body.session.fastestUserTurnWpm,
    slowest_user_turn_wpm: body.session.slowestUserTurnWpm,
    wpm_trend_slope_per_turn: body.session.wpmTrendSlopePerTurn,
    vocal_disfluency_candidate_count: body.session.vocalDisfluencyCandidateCount,
    lexical_discourse_candidate_count: body.session.lexicalDiscourseCandidateCount,
    repetition_candidate_count: body.session.repetitionCandidateCount,
    candidate_rate_per_100_words: body.session.candidateRatePer100Words,
    candidate_rate_per_minute_speaking: body.session.candidateRatePerMinuteSpeaking,
    intra_pause_count: body.session.intraPauseCount,
    total_intra_pause_ms: body.session.totalIntraPauseMs,
    avg_intra_pause_ms: body.session.avgIntraPauseMs,
    median_intra_pause_ms: body.session.medianIntraPauseMs,
    longest_intra_pause_ms: body.session.longestIntraPauseMs,
    pauses_per_minute_speaking: body.session.pausesPerMinuteSpeaking,
  };
}
