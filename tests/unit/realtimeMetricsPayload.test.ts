import { describe, expect, it } from "vitest";
import {
  mapMetricsPayloadToSessionMetrics,
  mapMetricsPayloadToTurnEvents,
  metricsPayloadSchema,
  type MetricsPayload,
} from "@/lib/realtime/metricsPayload";

/**
 * Regression coverage for a production bug: /api/simulation/realtime/metrics rejected every
 * payload with Postgres error 22P02 ("invalid input syntax for type integer: \"16258.5\"") because
 * several realtime_turn_events/realtime_session_metrics columns were declared `integer` while the
 * values they receive are derived from the client's monotonic clock (performance.now()), which is
 * inherently fractional. Fixed by migration 0010 (those columns are now `double precision`); these
 * tests confirm the validation + DB-row-mapping layer accepts and preserves fractional values
 * exactly, with no application-code rounding, while genuine integer counters are still enforced.
 */

const FRACTIONAL_MS = 16258.5; // the exact value from the production error

function basePayload(): MetricsPayload {
  return {
    sessionId: "session-1",
    userTurns: [],
    aiTurns: [],
    overlaps: [],
    confirmedBargeIns: [],
    session: {
      totalDurationMs: 30000,
      userTurnCount: 0,
      aiTurnCount: 0,
      totalUserSpeakingMs: 0,
      totalAiSpeakingMs: 0,
      userSpeakingPercentage: 0,
      aiSpeakingPercentage: 0,
      totalOverlapMs: 0,
      overlapCount: 0,
      confirmedInterruptionCount: 0,
      technicalBargeInCount: 0,
      suspectedNoiseEventCount: 0,
      avgUserTurnDurationMs: null,
      longestUserTurnMs: null,
      avgAiTurnDurationMs: null,
      avgUserResponseLatencyMs: null,
      medianUserResponseLatencyMs: null,
      longestUserResponseLatencyMs: null,
      avgAiResponseLatencyMs: null,
      medianAiResponseLatencyMs: null,
    },
  };
}

describe("metricsPayloadSchema", () => {
  it("accepts a fractional user turn start/end/duration, including the exact production value 16258.5", () => {
    const payload = basePayload();
    payload.userTurns.push({
      turnIndex: 1,
      classification: "confirmed",
      itemId: "item_1",
      startMs: FRACTIONAL_MS,
      endMs: FRACTIONAL_MS + 820.25,
      durationMs: 820.25,
      durationSource: "client_playback",
      endedBySessionClose: false,
      serverAudioStartMs: null,
      serverAudioEndMs: null,
      transcript: "Sure, let's do that.",
      transcriptionFailed: false,
    });

    const result = metricsPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.userTurns[0].startMs).toBe(FRACTIONAL_MS);
    }
  });

  it("accepts fractional AI playback timing", () => {
    const payload = basePayload();
    payload.aiTurns.push({
      turnIndex: 1,
      responseId: "resp_1",
      startMs: 1200.333,
      endMs: 3450.667,
      durationMs: 2250.334,
      wasInterrupted: false,
      endedBySessionClose: false,
      responseStatus: "completed",
      transcript: "Understood.",
    });

    expect(metricsPayloadSchema.safeParse(payload).success).toBe(true);
  });

  it("accepts fractional overlap duration", () => {
    const payload = basePayload();
    payload.overlaps.push({
      startMs: 5000.1,
      endMs: 5300.9,
      durationMs: 300.8,
      userItemId: "item_1",
      aiResponseId: "resp_1",
    });

    expect(metricsPayloadSchema.safeParse(payload).success).toBe(true);
  });

  it("accepts fractional user response latency and AI/system latency, including averages and medians", () => {
    const payload = basePayload();
    payload.session.avgUserResponseLatencyMs = 712.333333;
    payload.session.medianUserResponseLatencyMs = 700.5;
    payload.session.longestUserResponseLatencyMs = 1201.75;
    payload.session.avgAiResponseLatencyMs = 458.6666;
    payload.session.medianAiResponseLatencyMs = 450.25;
    payload.session.totalDurationMs = FRACTIONAL_MS;
    payload.session.avgUserTurnDurationMs = 950.125;
    payload.session.longestUserTurnMs = 1800.875;
    payload.session.avgAiTurnDurationMs = 2100.5;

    const result = metricsPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("still enforces integer counters as whole numbers", () => {
    const payload = basePayload();
    payload.session.userTurnCount = 2.5;
    expect(metricsPayloadSchema.safeParse(payload).success).toBe(false);

    const payload2 = basePayload();
    payload2.session.overlapCount = 1.5;
    expect(metricsPayloadSchema.safeParse(payload2).success).toBe(false);

    const payload3 = basePayload();
    payload3.session.confirmedInterruptionCount = 0.5;
    expect(metricsPayloadSchema.safeParse(payload3).success).toBe(false);

    const payload4 = basePayload();
    payload4.session.suspectedNoiseEventCount = 3.5;
    expect(metricsPayloadSchema.safeParse(payload4).success).toBe(false);

    const payload5 = basePayload();
    payload5.aiTurns.push({
      turnIndex: 1.5, // turn indices must stay whole numbers
      responseId: "resp_1",
      startMs: 0,
      endMs: 100,
      durationMs: 100,
      wasInterrupted: false,
      endedBySessionClose: false,
      responseStatus: "completed",
      transcript: null,
    });
    expect(metricsPayloadSchema.safeParse(payload5).success).toBe(false);
  });
});

describe("mapMetricsPayloadToTurnEvents", () => {
  it("preserves fractional ms values exactly, with no rounding, for every event kind", () => {
    const payload = basePayload();
    payload.userTurns.push({
      turnIndex: 1,
      classification: "confirmed",
      itemId: "item_1",
      startMs: FRACTIONAL_MS,
      endMs: FRACTIONAL_MS + 500.25,
      durationMs: 500.25,
      durationSource: "client_playback",
      endedBySessionClose: false,
      serverAudioStartMs: 1000.1,
      serverAudioEndMs: 1500.3,
      transcript: "Okay.",
      transcriptionFailed: false,
    });
    payload.aiTurns.push({
      turnIndex: 1,
      responseId: "resp_1",
      startMs: 2000.4,
      endMs: 3000.6,
      durationMs: 1000.2,
      wasInterrupted: false,
      endedBySessionClose: false,
      responseStatus: "completed",
      transcript: "Sure.",
    });
    payload.overlaps.push({
      startMs: 100.1,
      endMs: 200.2,
      durationMs: 100.1,
      userItemId: "item_1",
      aiResponseId: "resp_1",
    });
    payload.confirmedBargeIns.push({ atMs: 999.9, aiResponseId: "resp_1", context: "audible", countsTowardInterruption: true });

    const events = mapMetricsPayloadToTurnEvents(payload);

    const userEvent = events.find((e) => e.kind === "user_turn")!;
    expect(userEvent.start_ms).toBe(FRACTIONAL_MS);
    expect(userEvent.duration_ms).toBe(500.25);
    expect(userEvent.server_audio_start_ms).toBe(1000.1);
    expect(userEvent.server_audio_end_ms).toBe(1500.3);

    const aiEvent = events.find((e) => e.kind === "ai_turn")!;
    expect(aiEvent.start_ms).toBe(2000.4);
    expect(aiEvent.duration_ms).toBe(1000.2);

    const overlapEvent = events.find((e) => e.kind === "overlap")!;
    expect(overlapEvent.duration_ms).toBe(100.1);

    const bargeInEvent = events.find((e) => e.kind === "confirmed_barge_in")!;
    expect(bargeInEvent.start_ms).toBe(999.9);
    expect(bargeInEvent.barge_in_context).toBe("audible");
    expect(bargeInEvent.counts_toward_interruption).toBe(true);
  });

  it("keeps turn_index as a whole number while every ms field stays untouched", () => {
    const payload = basePayload();
    payload.userTurns.push({
      turnIndex: 3,
      classification: "confirmed",
      itemId: "item_1",
      startMs: 16258.5,
      endMs: 17000.75,
      durationMs: 742.25,
      durationSource: "client_playback",
      endedBySessionClose: false,
      serverAudioStartMs: null,
      serverAudioEndMs: null,
      transcript: "Right.",
      transcriptionFailed: false,
    });

    const [event] = mapMetricsPayloadToTurnEvents(payload);
    expect(Number.isInteger(event.turn_index)).toBe(true);
    expect(event.start_ms).toBe(16258.5);
  });
});

describe("mapMetricsPayloadToSessionMetrics", () => {
  it("preserves fractional averages/medians/totals exactly and keeps counters as integers", () => {
    const payload = basePayload();
    payload.session = {
      totalDurationMs: FRACTIONAL_MS,
      userTurnCount: 4,
      aiTurnCount: 5,
      totalUserSpeakingMs: 8123.75,
      totalAiSpeakingMs: 9042.125,
      userSpeakingPercentage: 27.1,
      aiSpeakingPercentage: 30.4,
      totalOverlapMs: 512.5,
      overlapCount: 2,
      confirmedInterruptionCount: 1,
      technicalBargeInCount: 2,
      suspectedNoiseEventCount: 3,
      avgUserTurnDurationMs: 950.125,
      longestUserTurnMs: 1800.875,
      avgAiTurnDurationMs: 2100.5,
      avgUserResponseLatencyMs: 712.333333,
      medianUserResponseLatencyMs: 700.5,
      longestUserResponseLatencyMs: 1201.75,
      avgAiResponseLatencyMs: 458.6666,
      medianAiResponseLatencyMs: 450.25,
    };

    const row = mapMetricsPayloadToSessionMetrics(payload);

    expect(row.total_duration_ms).toBe(FRACTIONAL_MS);
    expect(row.avg_user_response_latency_ms).toBe(712.333333);
    expect(row.median_user_response_latency_ms).toBe(700.5);
    expect(row.avg_ai_response_latency_ms).toBe(458.6666);
    expect(row.median_ai_response_latency_ms).toBe(450.25);
    expect(row.avg_user_turn_duration_ms).toBe(950.125);
    expect(row.longest_user_turn_ms).toBe(1800.875);
    expect(row.avg_ai_turn_duration_ms).toBe(2100.5);
    expect(row.total_user_speaking_ms).toBe(8123.75);
    expect(row.total_ai_speaking_ms).toBe(9042.125);
    expect(row.total_overlap_ms).toBe(512.5);

    // Genuine counters stay whole numbers — never rounded/coerced away from integers.
    expect(Number.isInteger(row.user_turn_count)).toBe(true);
    expect(Number.isInteger(row.ai_turn_count)).toBe(true);
    expect(Number.isInteger(row.overlap_count)).toBe(true);
    expect(Number.isInteger(row.confirmed_interruption_count)).toBe(true);
    expect(Number.isInteger(row.technical_barge_in_count)).toBe(true);
    expect(row.technical_barge_in_count).toBe(2);
    expect(Number.isInteger(row.suspected_noise_event_count)).toBe(true);
  });

  it("produces a payload successfully accepted end-to-end by the mapping layer (schema parse -> row mapping)", () => {
    const raw = basePayload();
    raw.userTurns.push({
      turnIndex: 1,
      classification: "confirmed",
      itemId: "item_1",
      startMs: 16258.5,
      endMs: 17058.5,
      durationMs: 800,
      durationSource: "client_playback",
      endedBySessionClose: false,
      serverAudioStartMs: null,
      serverAudioEndMs: null,
      transcript: "Yes, that works.",
      transcriptionFailed: false,
    });
    raw.session.userTurnCount = 1;
    raw.session.avgUserTurnDurationMs = 800;
    raw.session.longestUserTurnMs = 800;

    const parsed = metricsPayloadSchema.parse(raw); // throws on failure — this is the exact call the route makes
    const turnEvents = mapMetricsPayloadToTurnEvents(parsed);
    const sessionMetrics = mapMetricsPayloadToSessionMetrics(parsed);

    expect(turnEvents).toHaveLength(1);
    expect(turnEvents[0].start_ms).toBe(16258.5);
    expect(sessionMetrics.user_turn_count).toBe(1);
  });
});
