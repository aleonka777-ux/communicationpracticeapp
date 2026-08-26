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
