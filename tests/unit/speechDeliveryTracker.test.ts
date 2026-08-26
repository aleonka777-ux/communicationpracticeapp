import { describe, expect, it } from "vitest";
import { createSpeechDeliveryTracker } from "@/lib/realtime/speechDeliveryTracker";

/** Deterministic manual clock, matching sessionTimeline.test.ts's own pattern. */
function createClock(startAt = 0) {
  let value = startAt;
  return {
    now: () => value,
    advance: (ms: number) => {
      value += ms;
    },
  };
}

const SPEECH = 0.05; // comfortably above the adaptive noise floor once calibrated
const SILENCE = 0.0005; // comfortably below it

/** pushEnergySample() updates the shared noise-floor tracker regardless of whether any turn is
 *  open — calibrating BEFORE openTurn() mirrors the real deployment, where ambient noise is
 *  sampled continuously and a turn only opens once the server's VAD has already confirmed real
 *  speech began (see speechDeliveryTracker.ts's own doc comment). Calibrating inside an open turn
 *  would make ordinary pre-speech ambient noise look like a leading in-turn pause. */
function calibrate(tracker: ReturnType<typeof createSpeechDeliveryTracker>, clock: ReturnType<typeof createClock>, n = 5) {
  for (let i = 0; i < n; i++) {
    tracker.pushEnergySample(SILENCE);
    clock.advance(50);
  }
}

function speechBurst(tracker: ReturnType<typeof createSpeechDeliveryTracker>, clock: ReturnType<typeof createClock>, n: number) {
  for (let i = 0; i < n; i++) {
    tracker.pushEnergySample(SPEECH);
    clock.advance(50);
  }
}

function silenceBurst(tracker: ReturnType<typeof createSpeechDeliveryTracker>, clock: ReturnType<typeof createClock>, n: number) {
  for (let i = 0; i < n; i++) {
    tracker.pushEnergySample(SILENCE);
    clock.advance(50);
  }
}

describe("createSpeechDeliveryTracker — pause detection", () => {
  it("detects a single meaningful pause in the middle of a turn", () => {
    const clock = createClock();
    const tracker = createSpeechDeliveryTracker({ now: clock.now });

    calibrate(tracker, clock);
    tracker.openTurn("item_1");
    speechBurst(tracker, clock, 10);
    silenceBurst(tracker, clock, 8); // ~400ms pause, above the 250ms threshold
    speechBurst(tracker, clock, 10); // resumes speech, closing the pause
    tracker.closeTurn("item_1");

    const snapshot = tracker.finalize();
    expect(snapshot.pauses).toHaveLength(1);
    expect(snapshot.pauses[0].itemId).toBe("item_1");
    expect(snapshot.pauses[0].durationMs).toBeGreaterThanOrEqual(250);
  });

  it("does not count a micro-gap below the 250ms threshold as a pause", () => {
    const clock = createClock();
    const tracker = createSpeechDeliveryTracker({ now: clock.now });

    calibrate(tracker, clock);
    tracker.openTurn("item_1");
    speechBurst(tracker, clock, 5);
    // Only a 100ms dip — a normal phonetic micro-gap, not a meaningful pause.
    tracker.pushEnergySample(SILENCE);
    clock.advance(100);
    tracker.pushEnergySample(SPEECH);
    clock.advance(50);
    speechBurst(tracker, clock, 5);
    tracker.closeTurn("item_1");

    expect(tracker.finalize().pauses).toHaveLength(0);
  });

  it("detects multiple meaningful pauses within one turn", () => {
    const clock = createClock();
    const tracker = createSpeechDeliveryTracker({ now: clock.now });

    calibrate(tracker, clock);
    tracker.openTurn("item_1");
    speechBurst(tracker, clock, 6);
    silenceBurst(tracker, clock, 8); // ~400ms pause #1
    speechBurst(tracker, clock, 6);
    silenceBurst(tracker, clock, 10); // ~500ms pause #2
    speechBurst(tracker, clock, 6);
    tracker.closeTurn("item_1");

    expect(tracker.finalize().pauses).toHaveLength(2);
  });

  it("buckets a pause near the beginning, middle, and end of a turn correctly", () => {
    const clock = createClock();
    const tracker = createSpeechDeliveryTracker({ now: clock.now });

    calibrate(tracker, clock);
    tracker.openTurn("item_1");

    // Pause near the beginning
    silenceBurst(tracker, clock, 8);
    speechBurst(tracker, clock, 20);
    // Pause near the middle
    silenceBurst(tracker, clock, 8);
    speechBurst(tracker, clock, 20);
    // Pause near the end, but NOT still open at turn close (must resume speech briefly after)
    silenceBurst(tracker, clock, 8);
    speechBurst(tracker, clock, 3);
    tracker.closeTurn("item_1");

    const { pauses } = tracker.finalize();
    expect(pauses).toHaveLength(3);
    expect(pauses[0].positionBucket).toBe("beginning");
    expect(pauses[1].positionBucket).toBe("middle");
    expect(pauses[2].positionBucket).toBe("end");
  });

  it("excludes a pause still in progress when the turn closes (VAD detection tail, not a resumed pause)", () => {
    const clock = createClock();
    const tracker = createSpeechDeliveryTracker({ now: clock.now });

    calibrate(tracker, clock);
    tracker.openTurn("item_1");
    speechBurst(tracker, clock, 10);
    // Silence right up to turn close — never resumes speech before closeTurn().
    silenceBurst(tracker, clock, 10);
    tracker.closeTurn("item_1");

    expect(tracker.finalize().pauses).toHaveLength(0);
  });

  it("keeps pauses from different turns correctly attributed by itemId", () => {
    const clock = createClock();
    const tracker = createSpeechDeliveryTracker({ now: clock.now });
    calibrate(tracker, clock);

    for (const itemId of ["item_1", "item_2"]) {
      tracker.openTurn(itemId);
      speechBurst(tracker, clock, 6);
      silenceBurst(tracker, clock, 8);
      speechBurst(tracker, clock, 6);
      tracker.closeTurn(itemId);
    }

    const { pauses } = tracker.finalize();
    expect(pauses).toHaveLength(2);
    expect(pauses.map((p) => p.itemId).sort()).toEqual(["item_1", "item_2"]);
  });

  it("finalize() closes a still-open turn without throwing and excludes its trailing silence", () => {
    const clock = createClock();
    const tracker = createSpeechDeliveryTracker({ now: clock.now });

    calibrate(tracker, clock);
    tracker.openTurn("item_1");
    speechBurst(tracker, clock, 5);
    // Never explicitly closed — session ended mid-turn (e.g. manual End Practice).
    const snapshot = tracker.finalize();
    expect(snapshot.pauses).toEqual([]);
  });
});

describe("createSpeechDeliveryTracker — relative intensity aggregation", () => {
  it("computes avg/peak/variability for a turn's samples, never claiming dB SPL", () => {
    const clock = createClock();
    const tracker = createSpeechDeliveryTracker({ now: clock.now });

    tracker.openTurn("item_1");
    const samples = [0.01, 0.02, 0.03, 0.04, 0.05];
    for (const s of samples) {
      tracker.pushEnergySample(s);
      clock.advance(50);
    }
    tracker.closeTurn("item_1");

    const { turnIntensity } = tracker.finalize();
    expect(turnIntensity).toHaveLength(1);
    const evidence = turnIntensity[0];
    expect(evidence.itemId).toBe("item_1");
    expect(evidence.avgRelativeIntensity).toBeCloseTo(0.03, 5);
    expect(evidence.peakRelativeIntensity).toBeCloseTo(0.05, 5);
    expect(evidence.intensityVariability).toBeGreaterThan(0);
    expect(evidence.sampleCount).toBe(5);
    // Structural guarantee, not just a naming convention: nothing in the evidence type claims a
    // decibel/SPL unit — see the module's own doc comment.
    expect(Object.keys(evidence)).not.toContain("db");
    expect(Object.keys(evidence)).not.toContain("dbSpl");
  });

  it("produces no intensity evidence for a turn that never received a sample", () => {
    const clock = createClock();
    const tracker = createSpeechDeliveryTracker({ now: clock.now });

    tracker.openTurn("item_1");
    tracker.closeTurn("item_1");

    expect(tracker.finalize().turnIntensity).toEqual([]);
  });
});

describe("createSpeechDeliveryTracker — no raw audio persisted", () => {
  it("the tracker's public surface only ever accepts/returns scalar numbers, never a buffer/array of audio samples", () => {
    const clock = createClock();
    const tracker = createSpeechDeliveryTracker({ now: clock.now });

    tracker.openTurn("item_1");
    // pushEnergySample's type signature only accepts a single number — this is enforced by
    // TypeScript at compile time; this test documents/asserts the runtime shape of what finalize()
    // returns contains no audio-like structures (Float32Array, ArrayBuffer, base64 strings).
    tracker.pushEnergySample(0.02);
    clock.advance(50);
    tracker.closeTurn("item_1");

    const snapshot = tracker.finalize();
    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toMatch(/data:audio/);
    for (const evidence of snapshot.turnIntensity) {
      for (const value of Object.values(evidence)) {
        expect(value instanceof Float32Array || value instanceof ArrayBuffer).toBe(false);
      }
    }
  });
});
