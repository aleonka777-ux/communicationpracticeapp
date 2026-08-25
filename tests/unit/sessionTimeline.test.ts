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

    // User responds: 2.5s -> 4.5s (2s duration), transcribed
    clock.advance(500);
    timeline.recordUserSpeechStarted("item_1");
    clock.advance(2000);
    timeline.recordUserSpeechStopped("item_1");
    timeline.recordUserTranscript("item_1", "I can do Friday at 3pm.");

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
    expect(snapshot.userTurns[0].classification).toBe("confirmed");
    expect(snapshot.session.userTurnCount).toBe(1);
    expect(snapshot.session.aiTurnCount).toBe(2);
  });

  it("computes correct user turn duration, preferring server VAD timing when available", () => {
    const clock = createClock();
    const timeline = createSessionTimeline({ now: clock.now });

    timeline.recordUserSpeechStarted("item_1", 1000);
    clock.advance(3000); // client clock says 3000ms, server says 2500ms
    timeline.recordUserSpeechStopped("item_1", 3500);
    timeline.recordUserTranscript("item_1", "Sounds good, let's do that.");

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
    timeline.recordUserTranscript("item_1", "That works for me.");

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
    timeline.recordUserTranscript("item_1", "Okay, that makes sense.");

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
    timeline.recordUserTranscript("item_1", "Can we talk about the deadline?");

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
    timeline.recordUserTranscript("item_1", "Actually, wait a second.");

    const snapshot = timeline.finalize();
    // No AI turn ends strictly before this user turn starts, so there is no latency sample for it.
    expect(snapshot.session.avgUserResponseLatencyMs).toBeNull();
    expect(snapshot.session.userTurnCount).toBe(1);
  });

  it("classifies a confirmed barge-in as a real user turn regardless of transcript or duration", () => {
    const clock = createClock();
    const timeline = createSessionTimeline({ now: clock.now });

    timeline.recordAiAudioStarted("resp_1");
    clock.advance(1000);
    timeline.recordUserSpeechStarted("item_1");
    clock.advance(120); // brief, and no transcript ever arrives for it
    timeline.recordConfirmedBargeIn();
    clock.advance(30);
    timeline.recordResponseCancelled("resp_1", "confirmed_bargein");
    timeline.recordAiAudioStopped("resp_1");
    timeline.recordResponseDone("resp_1", "cancelled");
    clock.advance(200);
    timeline.recordUserSpeechStopped("item_1");

    const snapshot = timeline.finalize();
    expect(snapshot.confirmedBargeIns).toHaveLength(1);
    expect(snapshot.session.confirmedInterruptionCount).toBe(1);
    expect(snapshot.aiTurns[0].wasInterrupted).toBe(true);
    expect(snapshot.aiTurns[0].durationMs).toBe(1150); // the one true stop event, not counted twice

    // The interrupting user turn itself: a sustained, confirmed interruption is unambiguous
    // evidence of real speech, so it's "confirmed" even with no transcript and a short duration.
    expect(snapshot.userTurns).toHaveLength(1);
    expect(snapshot.userTurns[0].classification).toBe("confirmed");
    expect(snapshot.userTurns[0].turnIndex).toBe(1);
    expect(snapshot.session.userTurnCount).toBe(1);
  });

  it("classifies a speaker-echo VAD blip with no meaningful transcription as suspected noise, excluded from all session metrics", () => {
    const clock = createClock();
    const timeline = createSessionTimeline({ now: clock.now });

    timeline.recordAiAudioStarted("resp_1");
    clock.advance(500);
    // A raw speech_started/speech_stopped pair occurs (e.g. echo). No confirmed barge-in ever
    // fires for it (the barge-in controller never confirmed it), and no transcript ever arrives.
    timeline.recordUserSpeechStarted("item_blip");
    clock.advance(80);
    timeline.recordUserSpeechStopped("item_blip");
    clock.advance(1420);
    timeline.recordAiAudioStopped("resp_1");
    timeline.recordResponseDone("resp_1", "completed");

    const snapshot = timeline.finalize();
    expect(snapshot.confirmedBargeIns).toHaveLength(0);
    expect(snapshot.session.confirmedInterruptionCount).toBe(0);
    expect(snapshot.aiTurns[0].wasInterrupted).toBe(false);

    // The blip is still returned in userTurns for diagnostics, but classified out of everything.
    expect(snapshot.userTurns).toHaveLength(1);
    expect(snapshot.userTurns[0].classification).toBe("suspected_noise");
    expect(snapshot.userTurns[0].turnIndex).toBeNull();
    expect(snapshot.userTurns[0].durationMs).toBe(80);

    expect(snapshot.session.userTurnCount).toBe(0);
    expect(snapshot.session.totalUserSpeakingMs).toBe(0);
    expect(snapshot.session.avgUserTurnDurationMs).toBeNull();
    expect(snapshot.session.longestUserTurnMs).toBeNull();
    expect(snapshot.session.suspectedNoiseEventCount).toBe(1);
  });

  it("classifies a genuine short spoken response ('yes') with valid transcription as confirmed, however brief", () => {
    const clock = createClock();
    const timeline = createSessionTimeline({ now: clock.now });

    timeline.recordAiAudioStarted("resp_1");
    clock.advance(500);
    timeline.recordAiAudioStopped("resp_1");
    timeline.recordResponseDone("resp_1", "completed");

    clock.advance(300);
    timeline.recordUserSpeechStarted("item_1");
    clock.advance(90); // as short as the echo blip above
    timeline.recordUserSpeechStopped("item_1");
    timeline.recordUserTranscript("item_1", "Yes.");

    const snapshot = timeline.finalize();
    expect(snapshot.userTurns).toHaveLength(1);
    expect(snapshot.userTurns[0].classification).toBe("confirmed");
    expect(snapshot.userTurns[0].turnIndex).toBe(1);
    expect(snapshot.userTurns[0].durationMs).toBe(90);
    expect(snapshot.session.userTurnCount).toBe(1);
    expect(snapshot.session.totalUserSpeakingMs).toBe(90);
    expect(snapshot.session.suspectedNoiseEventCount).toBe(0);
  });

  it("classifies an explicit transcription failure as suspected noise even at a longer, ambiguous duration", () => {
    const clock = createClock();
    const timeline = createSessionTimeline({ now: clock.now });

    timeline.recordUserSpeechStarted("item_1");
    clock.advance(900); // well above the no-evidence duration fallback threshold
    timeline.recordUserSpeechStopped("item_1");
    timeline.recordUserTranscriptionFailed("item_1");

    const snapshot = timeline.finalize();
    expect(snapshot.userTurns[0].classification).toBe("suspected_noise");
    expect(snapshot.userTurns[0].transcriptionFailed).toBe(true);
    expect(snapshot.session.userTurnCount).toBe(0);
  });

  it("classifies a completed-but-empty transcription as suspected noise", () => {
    const clock = createClock();
    const timeline = createSessionTimeline({ now: clock.now });

    timeline.recordUserSpeechStarted("item_1");
    clock.advance(900);
    timeline.recordUserSpeechStopped("item_1");
    timeline.recordUserTranscript("item_1", "   "); // completed, but no actual words

    const snapshot = timeline.finalize();
    expect(snapshot.userTurns[0].classification).toBe("suspected_noise");
    expect(snapshot.session.userTurnCount).toBe(0);
  });

  it("does not treat a very short event with no transcript evidence at all as confirmed", () => {
    const clock = createClock();
    const timeline = createSessionTimeline({ now: clock.now });

    timeline.recordUserSpeechStarted("item_1");
    clock.advance(60); // short, and transcription never arrives (not completed, not failed)
    timeline.recordUserSpeechStopped("item_1");

    const snapshot = timeline.finalize();
    expect(snapshot.userTurns[0].classification).toBe("suspected_noise");
  });

  it("excludes a suspected-noise event from overlap, while a genuine overlapping turn is still counted", () => {
    const clock = createClock();
    const timeline = createSessionTimeline({ now: clock.now });

    // A noise blip that happens to coincide with AI playback must not register as overlap.
    timeline.recordAiAudioStarted("resp_1");
    clock.advance(200);
    timeline.recordUserSpeechStarted("item_blip");
    clock.advance(70);
    timeline.recordUserSpeechStopped("item_blip"); // no transcript ever arrives -> suspected_noise
    clock.advance(730);
    timeline.recordAiAudioStopped("resp_1"); // AI turn: 0 -> 1000ms
    timeline.recordResponseDone("resp_1", "completed");

    // A genuine, transcribed overlap.
    clock.advance(500);
    timeline.recordAiAudioStarted("resp_2");
    clock.advance(300);
    timeline.recordUserSpeechStarted("item_genuine"); // overlap starts here
    clock.advance(200);
    timeline.recordAiAudioStopped("resp_2"); // AI turn ends -> overlap ends here
    timeline.recordResponseDone("resp_2", "completed");
    clock.advance(400);
    timeline.recordUserSpeechStopped("item_genuine");
    timeline.recordUserTranscript("item_genuine", "Hold on, let me finish.");

    const snapshot = timeline.finalize();
    expect(snapshot.overlaps).toHaveLength(1);
    expect(snapshot.overlaps[0].userItemId).toBe("item_genuine");
    expect(snapshot.overlaps[0].durationMs).toBe(200);
    expect(snapshot.session.overlapCount).toBe(1);
    expect(snapshot.session.totalOverlapMs).toBe(200);
    expect(snapshot.session.suspectedNoiseEventCount).toBe(1);
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
    timeline.recordUserTranscript("item_1", "I think we're done here.");

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
    timeline.recordUserTranscript("item_1", "Let's move forward with the plan.");
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
    timeline.recordUserTranscript("item_1", "Understood, thanks.");

    const first = timeline.finalize();
    clock.advance(5000);
    const second = timeline.finalize();

    expect(first.userTurns).toHaveLength(1);
    expect(second.userTurns).toHaveLength(1);
    expect(second.userTurns[0].durationMs).toBe(1000); // unchanged by the second finalize
  });

  it("stores only timestamps, durations, transcripts, classification and small metadata — never raw audio", () => {
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
      "classification",
      "itemId",
      "startMs",
      "endMs",
      "durationMs",
      "durationSource",
      "endedBySessionClose",
      "serverAudioStartMs",
      "serverAudioEndMs",
      "transcript",
      "transcriptionFailed",
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
      "suspectedNoiseEventCount",
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
