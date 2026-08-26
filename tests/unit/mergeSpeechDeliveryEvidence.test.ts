import { describe, expect, it } from "vitest";
import { createSessionTimeline } from "@/lib/realtime/sessionTimeline";
import { createSpeechDeliveryTracker } from "@/lib/realtime/speechDeliveryTracker";
import { mergeSpeechDeliveryEvidence } from "@/lib/realtime/mergeSpeechDeliveryEvidence";

function createClock(startAt = 0) {
  let value = startAt;
  return { now: () => value, advance: (ms: number) => (value += ms) };
}

describe("mergeSpeechDeliveryEvidence", () => {
  it("merges per-turn intensity evidence into sessionTimeline's userTurns by itemId", () => {
    const clock = createClock();
    const timeline = createSessionTimeline({ now: clock.now });
    const tracker = createSpeechDeliveryTracker({ now: clock.now });

    timeline.recordUserSpeechStarted("item_1");
    tracker.openTurn("item_1");
    tracker.pushEnergySample(0.02);
    clock.advance(2000);
    timeline.recordUserSpeechStopped("item_1");
    tracker.closeTurn("item_1");
    timeline.recordUserTranscript("item_1", "Yes that works for me");

    const timelineSnapshot = timeline.finalize();
    const deliverySnapshot = tracker.finalize();
    const { userTurns } = mergeSpeechDeliveryEvidence(timelineSnapshot, deliverySnapshot);

    expect(userTurns).toHaveLength(1);
    expect(userTurns[0].avgRelativeIntensity).toBeCloseTo(0.02, 5);
  });

  it("leaves intensity fields null for a turn the mic-energy monitor never sampled", () => {
    const clock = createClock();
    const timeline = createSessionTimeline({ now: clock.now });
    const tracker = createSpeechDeliveryTracker({ now: clock.now });

    timeline.recordUserSpeechStarted("item_1");
    clock.advance(1000);
    timeline.recordUserSpeechStopped("item_1");
    timeline.recordUserTranscript("item_1", "Sure thing");

    const timelineSnapshot = timeline.finalize();
    const deliverySnapshot = tracker.finalize(); // never opened/sampled — e.g. mic monitor failed to start

    const { userTurns } = mergeSpeechDeliveryEvidence(timelineSnapshot, deliverySnapshot);
    expect(userTurns[0].avgRelativeIntensity).toBeNull();
    expect(userTurns[0].peakRelativeIntensity).toBeNull();
    expect(userTurns[0].intensityVariability).toBeNull();
  });

  it("excludes pauses belonging to a suspected-noise turn, even if the analyser detected one", () => {
    const clock = createClock();
    const timeline = createSessionTimeline({ now: clock.now });
    const tracker = createSpeechDeliveryTracker({ now: clock.now });

    // A suspected-noise event (empty transcript) that happens to have a "pause" recorded against it.
    timeline.recordUserSpeechStarted("item_1");
    tracker.openTurn("item_1");
    clock.advance(100);
    timeline.recordUserSpeechStopped("item_1");
    tracker.closeTurn("item_1");
    timeline.recordUserTranscript("item_1", "");

    const timelineSnapshot = timeline.finalize();
    expect(timelineSnapshot.userTurns[0].classification).toBe("suspected_noise");

    // Manually simulate a pause the analyser attributed to this now-excluded turn.
    const deliverySnapshot = {
      pauses: [{ itemId: "item_1", startMs: 10, durationMs: 300, positionRatio: 0.5, positionBucket: "middle" as const }],
      turnIntensity: [],
    };

    const { pauses, sessionPauseAggregates } = mergeSpeechDeliveryEvidence(timelineSnapshot, deliverySnapshot);
    expect(pauses).toHaveLength(0);
    expect(sessionPauseAggregates.intraPauseCount).toBe(0);
  });

  it("computes session-level pause aggregates (count/total/avg/median/longest/per-minute)", () => {
    const clock = createClock();
    const timeline = createSessionTimeline({ now: clock.now });

    timeline.recordUserSpeechStarted("item_1");
    clock.advance(60000); // 1 minute of confirmed user speaking time
    timeline.recordUserSpeechStopped("item_1");
    timeline.recordUserTranscript("item_1", "This is a long enough turn to count");

    const timelineSnapshot = timeline.finalize();
    const deliverySnapshot = {
      pauses: [
        { itemId: "item_1", startMs: 1000, durationMs: 300, positionRatio: 0.1, positionBucket: "beginning" as const },
        { itemId: "item_1", startMs: 30000, durationMs: 500, positionRatio: 0.5, positionBucket: "middle" as const },
      ],
      turnIntensity: [],
    };

    const { sessionPauseAggregates } = mergeSpeechDeliveryEvidence(timelineSnapshot, deliverySnapshot);
    expect(sessionPauseAggregates.intraPauseCount).toBe(2);
    expect(sessionPauseAggregates.totalIntraPauseMs).toBe(800);
    expect(sessionPauseAggregates.avgIntraPauseMs).toBe(400);
    expect(sessionPauseAggregates.longestIntraPauseMs).toBe(500);
    expect(sessionPauseAggregates.pausesPerMinuteSpeaking).toBeCloseTo(2, 5); // 2 pauses / 1 minute speaking
  });

  it("returns null pause aggregates (not zero-masquerading-as-data) when there are no pauses", () => {
    const clock = createClock();
    const timeline = createSessionTimeline({ now: clock.now });

    timeline.recordUserSpeechStarted("item_1");
    clock.advance(1000);
    timeline.recordUserSpeechStopped("item_1");
    timeline.recordUserTranscript("item_1", "Fine");

    const timelineSnapshot = timeline.finalize();
    const { sessionPauseAggregates } = mergeSpeechDeliveryEvidence(timelineSnapshot, { pauses: [], turnIntensity: [] });

    expect(sessionPauseAggregates.intraPauseCount).toBe(0);
    expect(sessionPauseAggregates.totalIntraPauseMs).toBe(0);
    expect(sessionPauseAggregates.avgIntraPauseMs).toBeNull();
    expect(sessionPauseAggregates.medianIntraPauseMs).toBeNull();
    expect(sessionPauseAggregates.longestIntraPauseMs).toBeNull();
  });
});

describe("mergeSpeechDeliveryEvidence — pause clock-origin invariants", () => {
  it("reports no violations for well-formed, session-relative pause evidence", () => {
    const clock = createClock();
    const timeline = createSessionTimeline({ now: clock.now });

    timeline.recordUserSpeechStarted("item_1");
    clock.advance(60000);
    timeline.recordUserSpeechStopped("item_1");
    timeline.recordUserTranscript("item_1", "This is a long enough turn to count");

    const timelineSnapshot = timeline.finalize();
    const deliverySnapshot = {
      pauses: [{ itemId: "item_1", startMs: 30000, durationMs: 400, positionRatio: 0.5, positionBucket: "middle" as const }],
      turnIntensity: [],
    };

    const { invariantViolations } = mergeSpeechDeliveryEvidence(timelineSnapshot, deliverySnapshot);
    expect(invariantViolations).toEqual([]);
  });

  it("flags a pause with a negative start_ms", () => {
    const clock = createClock();
    const timeline = createSessionTimeline({ now: clock.now });
    timeline.recordUserSpeechStarted("item_1");
    clock.advance(1000);
    timeline.recordUserSpeechStopped("item_1");
    timeline.recordUserTranscript("item_1", "Fine, that works");

    const timelineSnapshot = timeline.finalize();
    const deliverySnapshot = {
      pauses: [{ itemId: "item_1", startMs: -50, durationMs: 300, positionRatio: 0, positionBucket: "beginning" as const }],
      turnIntensity: [],
    };

    const { invariantViolations } = mergeSpeechDeliveryEvidence(timelineSnapshot, deliverySnapshot);
    expect(invariantViolations.some((v) => v.includes("< 0"))).toBe(true);
  });

  it("flags a pause whose start_ms exceeds the session's total_duration_ms", () => {
    const clock = createClock();
    const timeline = createSessionTimeline({ now: clock.now });
    timeline.recordUserSpeechStarted("item_1");
    clock.advance(1000);
    timeline.recordUserSpeechStopped("item_1");
    timeline.recordUserTranscript("item_1", "Fine, that works");
    // finalize() is called immediately after, so total_duration_ms ~= 1000

    const timelineSnapshot = timeline.finalize();
    const deliverySnapshot = {
      pauses: [{ itemId: "item_1", startMs: 999999, durationMs: 300, positionRatio: 0.5, positionBucket: "middle" as const }],
      turnIntensity: [],
    };

    const { invariantViolations } = mergeSpeechDeliveryEvidence(timelineSnapshot, deliverySnapshot);
    expect(invariantViolations.some((v) => v.includes("exceeding total_duration_ms"))).toBe(true);
  });

  it("flags a pause landing far outside its owning turn's span — the exact production symptom (a stale clock-origin offset)", () => {
    const clock = createClock();
    const timeline = createSessionTimeline({ now: clock.now });

    // Mirrors the reported production shape: user turn 3, 27621.7 -> 31001.6.
    clock.advance(27621.7);
    timeline.recordUserSpeechStarted("item_EHGN5nmxomM2AP0kzmTx0");
    clock.advance(31001.6 - 27621.7);
    timeline.recordUserSpeechStopped("item_EHGN5nmxomM2AP0kzmTx0");
    timeline.recordUserTranscript("item_EHGN5nmxomM2AP0kzmTx0", "This turn has plenty of words in it");
    clock.advance(95019.3); // pad out toward the reported session length, 126020.9ms total

    const timelineSnapshot = timeline.finalize();
    // The exact reported bad value: a pause offset by the ~48831.3ms stale clock origin.
    const deliverySnapshot = {
      pauses: [
        { itemId: "item_EHGN5nmxomM2AP0kzmTx0", startMs: 77270.3, durationMs: 300.3, positionRatio: 0.241805, positionBucket: "beginning" as const },
      ],
      turnIntensity: [],
    };

    const { invariantViolations } = mergeSpeechDeliveryEvidence(timelineSnapshot, deliverySnapshot);
    expect(invariantViolations.some((v) => v.includes("falls outside owning turn"))).toBe(true);
  });

  it("flags a position_ratio inconsistent with the canonical start_ms", () => {
    const clock = createClock();
    const timeline = createSessionTimeline({ now: clock.now });
    timeline.recordUserSpeechStarted("item_1");
    clock.advance(10000); // turn spans 0 -> 10000
    timeline.recordUserSpeechStopped("item_1");
    timeline.recordUserTranscript("item_1", "This is a long enough turn to count");

    const timelineSnapshot = timeline.finalize();
    // startMs=8000 on a 0->10000 turn is really ratio 0.8, not the claimed 0.1.
    const deliverySnapshot = {
      pauses: [{ itemId: "item_1", startMs: 8000, durationMs: 300, positionRatio: 0.1, positionBucket: "beginning" as const }],
      turnIntensity: [],
    };

    const { invariantViolations } = mergeSpeechDeliveryEvidence(timelineSnapshot, deliverySnapshot);
    expect(invariantViolations.some((v) => v.includes("position_ratio"))).toBe(true);
  });

  it("end-to-end: a session constructed on a clock whose raw origin is already ~48.8s old produces zero invariant violations after the fix", () => {
    const PRODUCTION_OFFSET_MS = 48831.3;
    const clock = createClock(PRODUCTION_OFFSET_MS);
    const timeline = createSessionTimeline({ now: clock.now });
    const tracker = createSpeechDeliveryTracker({ now: clock.now });

    timeline.recordUserSpeechStarted("item_1");
    tracker.openTurn("item_1");
    for (let i = 0; i < 10; i++) {
      tracker.pushEnergySample(0.05);
      clock.advance(50);
    }
    for (let i = 0; i < 8; i++) {
      tracker.pushEnergySample(0.0005);
      clock.advance(50);
    } // ~400ms meaningful pause
    for (let i = 0; i < 10; i++) {
      tracker.pushEnergySample(0.05);
      clock.advance(50);
    }
    timeline.recordUserSpeechStopped("item_1");
    tracker.closeTurn("item_1");
    timeline.recordUserTranscript("item_1", "This is a long enough turn to count words");

    const timelineSnapshot = timeline.finalize();
    const deliverySnapshot = tracker.finalize();
    const { invariantViolations, pauses } = mergeSpeechDeliveryEvidence(timelineSnapshot, deliverySnapshot);

    expect(pauses.length).toBeGreaterThan(0);
    expect(invariantViolations).toEqual([]);
  });
});
