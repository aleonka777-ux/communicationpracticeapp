import { describe, expect, it } from "vitest";
import { createSessionTimeline } from "@/lib/realtime/sessionTimeline";

/** Deterministic manual clock — advance() moves it forward by a fixed number of ms. */
function createClock(startAt = 0) {
  let value = startAt;
  return {
    now: () => value,
    advance: (ms: number) => {
      value += ms;
    },
  };
}

describe("createSessionTimeline", () => {
  it("records a normal AI -> user -> AI exchange with correct turn indices and durations", () => {
    const clock = createClock();
    const timeline = createSessionTimeline({ now: clock.now });

    // AI opening line: 0s -> 2s
    timeline.recordAiAudioStarted("resp_1");
    clock.advance(2000);
    timeline.recordAiAudioStopped("resp_1");
    timeline.recordResponseDone("resp_1", "completed");

    // User responds: 2.5s -> 4.5s (2s duration)
    clock.advance(500);
    timeline.recordUserSpeechStarted("item_1");
    clock.advance(2000);
    timeline.recordUserSpeechStopped("item_1");

    // AI replies: 5s -> 7s
    clock.advance(500);
    timeline.recordAiAudioStarted("resp_2");
    clock.advance(2000);
    timeline.recordAiAudioStopped("resp_2");
    timeline.recordResponseDone("resp_2", "completed");

    const snapshot = timeline.finalize();

    expect(snapshot.aiTurns).toHaveLength(2);
    expect(snapshot.userTurns).toHaveLength(1);
    expect(snapshot.aiTurns[0].turnIndex).toBe(1);
    expect(snapshot.aiTurns[1].turnIndex).toBe(2);
    expect(snapshot.userTurns[0].turnIndex).toBe(1);
    expect(snapshot.session.userTurnCount).toBe(1);
    expect(snapshot.session.aiTurnCount).toBe(2);
  });

  it("computes correct user turn duration, preferring server VAD timing when available", () => {
    const clock = createClock();
    const timeline = createSessionTimeline({ now: clock.now });

    timeline.recordUserSpeechStarted("item_1", 1000);
    clock.advance(3000); // client clock says 3000ms, server says 2500ms
    timeline.recordUserSpeechStopped("item_1", 3500);

    const snapshot = timeline.finalize();
    expect(snapshot.userTurns[0].durationSource).toBe("server_vad");
    expect(snapshot.userTurns[0].durationMs).toBe(2500); // 3500 - 1000, not the client's 3000
  });

  it("falls back to client-clock duration when server VAD timing is unavailable", () => {
    const clock = createClock();
    const timeline = createSessionTimeline({ now: clock.now });

    timeline.recordUserSpeechStarted("item_1");
    clock.advance(1800);
    timeline.recordUserSpeechStopped("item_1");

    const snapshot = timeline.finalize();
    expect(snapshot.userTurns[0].durationSource).toBe("client_playback");
    expect(snapshot.userTurns[0].durationMs).toBe(1800);
  });

  it("computes user response latency as user-speech-start minus the immediately preceding, non-overlapping AI turn's end", () => {
    const clock = createClock();
    const timeline = createSessionTimeline({ now: clock.now });

    timeline.recordAiAudioStarted("resp_1");
    clock.advance(2000);
    timeline.recordAiAudioStopped("resp_1"); // AI ends at 2000ms

    clock.advance(700); // 700ms gap before the user starts speaking
    timeline.recordUserSpeechStarted("item_1");
    clock.advance(1000);
    timeline.recordUserSpeechStopped("item_1");

    const snapshot = timeline.finalize();
    expect(snapshot.session.avgUserResponseLatencyMs).toBe(700);
    expect(snapshot.session.medianUserResponseLatencyMs).toBe(700);
    expect(snapshot.session.longestUserResponseLatencyMs).toBe(700);
  });

  it("computes AI/system response latency symmetrically, as a system metric only", () => {
    const clock = createClock();
    const timeline = createSessionTimeline({ now: clock.now });

    timeline.recordUserSpeechStarted("item_1");
    clock.advance(1000);
    timeline.recordUserSpeechStopped("item_1"); // user ends at 1000ms

    clock.advance(450); // system takes 450ms to start responding
    timeline.recordAiAudioStarted("resp_1");
    clock.advance(1500);
    timeline.recordAiAudioStopped("resp_1");

    const snapshot = timeline.finalize();
    expect(snapshot.session.avgAiResponseLatencyMs).toBe(450);
    expect(snapshot.session.medianAiResponseLatencyMs).toBe(450);
  });

  it("does not treat an overlapping (interrupting) user turn as ordinary positive response latency", () => {
    const clock = createClock();
    const timeline = createSessionTimeline({ now: clock.now });

    timeline.recordAiAudioStarted("resp_1");
    clock.advance(1000);
    // User starts speaking WHILE the AI is still talking (barge-in), before the AI turn ends.
    timeline.recordUserSpeechStarted("item_1");
    clock.advance(500);
    timeline.recordAiAudioStopped("resp_1"); // AI ends at 1500ms, after the user already started at 1000ms
    clock.advance(500);
    timeline.recordUserSpeechStopped("item_1");

    const snapshot = timeline.finalize();
    // No AI turn ends strictly before this user turn starts, so there is no latency sample for it.
    expect(snapshot.session.avgUserResponseLatencyMs).toBeNull();
    expect(snapshot.session.userTurnCount).toBe(1);
  });

  it("counts a confirmed barge-in and marks the interrupted AI turn, without double-counting its duration", () => {
    const clock = createClock();
    const timeline = createSessionTimeline({ now: clock.now });

    timeline.recordAiAudioStarted("resp_1");
    clock.advance(1200);
    timeline.recordConfirmedBargeIn();
    clock.advance(100);
    timeline.recordResponseCancelled("resp_1", "confirmed_bargein");
    timeline.recordAiAudioStopped("resp_1"); // playback actually stops at 1300ms
    timeline.recordResponseDone("resp_1", "cancelled");

    const snapshot = timeline.finalize();
    expect(snapshot.confirmedBargeIns).toHaveLength(1);
    expect(snapshot.session.confirmedInterruptionCount).toBe(1);
    expect(snapshot.aiTurns).toHaveLength(1);
    expect(snapshot.aiTurns[0].wasInterrupted).toBe(true);
    expect(snapshot.aiTurns[0].durationMs).toBe(1300); // the one true stop event, not counted twice
  });

  it("does not count a brief false VAD blip (no confirmed barge-in) as an interruption", () => {
    const clock = createClock();
    const timeline = createSessionTimeline({ now: clock.now });

    timeline.recordAiAudioStarted("resp_1");
    clock.advance(500);
    // A raw speech_started/speech_stopped pair occurs (e.g. echo), but the barge-in controller
    // never confirms it, so recordConfirmedBargeIn() is never called for it — this is the whole
    // point: the timeline only trusts the confirmed-barge-in signal, never raw VAD events.
    timeline.recordUserSpeechStarted("item_blip");
    clock.advance(50);
    timeline.recordUserSpeechStopped("item_blip");
    clock.advance(1450);
    timeline.recordAiAudioStopped("resp_1");
    timeline.recordResponseDone("resp_1", "completed");

    const snapshot = timeline.finalize();
    expect(snapshot.confirmedBargeIns).toHaveLength(0);
    expect(snapshot.session.confirmedInterruptionCount).toBe(0);
    expect(snapshot.aiTurns[0].wasInterrupted).toBe(false);
    // The blip is still recorded as its own (very short) user turn, just not as an interruption.
    expect(snapshot.userTurns).toHaveLength(1);
    expect(snapshot.userTurns[0].durationMs).toBe(50);
  });

  it("computes overlap duration as the intersection of a user speech interval and an AI playback interval, distinct from confirmed barge-in", () => {
    const clock = createClock();
    const timeline = createSessionTimeline({ now: clock.now });

    timeline.recordAiAudioStarted("resp_1");
    clock.advance(1000);
    timeline.recordUserSpeechStarted("item_1"); // overlap starts at 1000ms
    clock.advance(300);
    timeline.recordAiAudioStopped("resp_1"); // AI ends at 1300ms -> overlap ends here
    clock.advance(200);
    timeline.recordUserSpeechStopped("item_1");

    const snapshot = timeline.finalize();
    expect(snapshot.overlaps).toHaveLength(1);
    expect(snapshot.overlaps[0].durationMs).toBe(300);
    expect(snapshot.session.totalOverlapMs).toBe(300);
    expect(snapshot.session.overlapCount).toBe(1);
    // Overlap alone (no recordConfirmedBargeIn call) must never be reported as an interruption.
    expect(snapshot.session.confirmedInterruptionCount).toBe(0);
  });

  it("closes an AI turn left open by graceful timer completion without marking it interrupted", () => {
    const clock = createClock();
    const timeline = createSessionTimeline({ now: clock.now });

    timeline.recordAiAudioStarted("resp_1");
    clock.advance(1000);
    timeline.recordAiAudioStopped("resp_1");
    timeline.recordResponseDone("resp_1", "completed");

    const snapshot = timeline.finalize();
    expect(snapshot.aiTurns[0].endedBySessionClose).toBe(false);
    expect(snapshot.aiTurns[0].wasInterrupted).toBe(false);
  });

  it("closes a turn left open by manual End Practice at finalize time, flagged as ended-by-session-close rather than interrupted", () => {
    const clock = createClock();
    const timeline = createSessionTimeline({ now: clock.now });

    timeline.recordUserSpeechStarted("item_1");
    clock.advance(800);
    timeline.recordUserSpeechStopped("item_1");

    clock.advance(200);
    timeline.recordAiAudioStarted("resp_1");
    clock.advance(900); // manual End Practice fires mid-response; no stop/done event ever arrives

    const snapshot = timeline.finalize();
    expect(snapshot.aiTurns).toHaveLength(1);
    expect(snapshot.aiTurns[0].endMs).toBe(1900);
    expect(snapshot.aiTurns[0].durationMs).toBe(900);
    expect(snapshot.aiTurns[0].endedBySessionClose).toBe(true);
    expect(snapshot.aiTurns[0].wasInterrupted).toBe(false); // no confirmed barge-in occurred
  });

  it("ignores duplicate start/stop events instead of duplicating a turn or its duration", () => {
    const clock = createClock();
    const timeline = createSessionTimeline({ now: clock.now });

    timeline.recordUserSpeechStarted("item_1");
    timeline.recordUserSpeechStarted("item_1"); // duplicate start (e.g. reconnect replay)
    clock.advance(1000);
    timeline.recordUserSpeechStopped("item_1");
    timeline.recordUserSpeechStopped("item_1"); // duplicate stop
    clock.advance(500);

    timeline.recordAiAudioStarted("resp_1");
    timeline.recordAiAudioStarted("resp_1"); // duplicate start
    clock.advance(700);
    timeline.recordAiAudioStopped("resp_1");
    timeline.recordAiAudioStopped("resp_1"); // duplicate stop

    const snapshot = timeline.finalize();
    expect(snapshot.userTurns).toHaveLength(1);
    expect(snapshot.userTurns[0].durationMs).toBe(1000);
    expect(snapshot.aiTurns).toHaveLength(1);
    expect(snapshot.aiTurns[0].durationMs).toBe(700);
  });

  it("is idempotent under a duplicate finalize call — no double-counted totals", () => {
    const clock = createClock();
    const timeline = createSessionTimeline({ now: clock.now });

    timeline.recordUserSpeechStarted("item_1");
    clock.advance(1000);
    timeline.recordUserSpeechStopped("item_1");

    const first = timeline.finalize();
    clock.advance(5000);
    const second = timeline.finalize();

    expect(first.userTurns).toHaveLength(1);
    expect(second.userTurns).toHaveLength(1);
    expect(second.userTurns[0].durationMs).toBe(1000); // unchanged by the second finalize
  });

  it("stores only timestamps, durations, transcripts and small metadata — never raw audio", () => {
    const clock = createClock();
    const timeline = createSessionTimeline({ now: clock.now });

    timeline.recordUserSpeechStarted("item_1", 0);
    clock.advance(1000);
    timeline.recordUserSpeechStopped("item_1", 1000);
    timeline.recordUserTranscript("item_1", "I need this by Friday.");

    timeline.recordAiAudioStarted("resp_1");
    clock.advance(1000);
    timeline.recordAiAudioStopped("resp_1");
    timeline.recordAiTranscript("resp_1", "Understood, I'll have it ready.");
    timeline.recordResponseDone("resp_1", "completed");

    const snapshot = timeline.finalize();
    const serialized = JSON.stringify(snapshot);

    // Every field on every metric is a number, string, boolean, or null — no binary/blob/data-URI
    // audio payloads anywhere in the snapshot that gets persisted.
    const allowedKeys = new Set([
      "turnIndex",
      "itemId",
      "startMs",
      "endMs",
      "durationMs",
      "durationSource",
      "endedBySessionClose",
      "serverAudioStartMs",
      "serverAudioEndMs",
      "transcript",
      "responseId",
      "wasInterrupted",
      "responseStatus",
      "userItemId",
      "aiResponseId",
      "atMs",
      "reason",
      "totalDurationMs",
      "userTurns",
      "aiTurns",
      "overlaps",
      "confirmedBargeIns",
      "responseCancellations",
      "session",
      "userTurnCount",
      "aiTurnCount",
      "totalUserSpeakingMs",
      "totalAiSpeakingMs",
      "userSpeakingPercentage",
      "aiSpeakingPercentage",
      "totalOverlapMs",
      "overlapCount",
      "confirmedInterruptionCount",
      "avgUserTurnDurationMs",
      "longestUserTurnMs",
      "avgAiTurnDurationMs",
      "avgUserResponseLatencyMs",
      "medianUserResponseLatencyMs",
      "longestUserResponseLatencyMs",
      "avgAiResponseLatencyMs",
      "medianAiResponseLatencyMs",
    ]);

    function assertNoAudioFields(value: unknown): void {
      if (Array.isArray(value)) {
        value.forEach(assertNoAudioFields);
        return;
      }
      if (value !== null && typeof value === "object") {
        for (const [key, v] of Object.entries(value)) {
          expect(allowedKeys.has(key)).toBe(true);
          expect(key.toLowerCase()).not.toMatch(/audio(blob|buffer|data|url)|waveform|pcm|base64/);
          assertNoAudioFields(v);
        }
      }
    }

    assertNoAudioFields(snapshot);
    expect(serialized).not.toMatch(/data:audio/);
  });
});
