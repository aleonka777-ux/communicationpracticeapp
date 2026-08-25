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
      "audibleAiResponseIdAtStart",
      "responseId",
      "wasInterrupted",
      "responseStatus",
      "userItemId",
      "aiResponseId",
      "atMs",
      "context",
      "countsTowardInterruption",
      "reason",
      "totalDurationMs",
      "userTurns",
      "aiTurns",
      "overlaps",
      "confirmedBargeIns",
      "responseCancellations",
      "session",
      "invariantViolations",
      "userTurnCount",
      "aiTurnCount",
      "totalUserSpeakingMs",
      "totalAiSpeakingMs",
      "userSpeakingPercentage",
      "aiSpeakingPercentage",
      "totalOverlapMs",
      "overlapCount",
      "confirmedInterruptionCount",
      "technicalBargeInCount",
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

/**
 * Regression coverage for a production measurement-integrity report: a session with
 * confirmed_interruption_count=1 but overlap_count=0/total_overlap_ms=0. Root cause: bargeIn.ts
 * treats the AI as "speaking" from response.created onward (to close a media/data-channel
 * ordering race — see its own doc comment), which is EARLIER than this module's own AiTurnMetric
 * interval (output_audio_buffer.started -> .stopped, i.e. actual audio playback). A confirmed
 * barge-in can fire in the gap between the two — the server had started generating a response but
 * had not yet produced any audio for it — in which case 0 overlap is correct (nothing was ever
 * playing to overlap with), but recordConfirmedBargeIn() was attributing it to a null aiResponseId
 * instead of the response actually being interrupted. Fixed with recordResponseCreated(), tracked
 * separately from the actual-playback AiTurnMetric interval.
 */
describe("createSessionTimeline — confirmed barge-in during active AI playback (the normal case)", () => {
  it("user begins speaking while AI playback is active, barge-in confirms at 250ms, AI is cancelled, and overlap reflects the actual simultaneous-speech interval", () => {
    const clock = createClock();
    const timeline = createSessionTimeline({ now: clock.now });

    // A response is created, then its audio actually starts playing.
    timeline.recordResponseCreated("resp_1");
    clock.advance(300); // model generation latency before audio starts
    timeline.recordAiAudioStarted("resp_1");

    // 1s into playback, the user begins speaking over it.
    clock.advance(1000);
    timeline.recordUserSpeechStarted("item_1");

    // Barge-in confirms after the standard 250ms confirmation window, AI audio is cancelled.
    clock.advance(250);
    timeline.recordConfirmedBargeIn();
    timeline.recordResponseCancelled("resp_1", "confirmed_bargein");

    // Whatever was already buffered keeps playing briefly before output_audio_buffer.stopped fires.
    clock.advance(80);
    timeline.recordAiAudioStopped("resp_1");
    timeline.recordResponseDone("resp_1", "cancelled");

    // The user keeps talking a bit longer after the AI actually stops.
    clock.advance(400);
    timeline.recordUserSpeechStopped("item_1");
    timeline.recordUserTranscript("item_1", "Wait, let me stop you there.");

    const snapshot = timeline.finalize();

    expect(snapshot.session.confirmedInterruptionCount).toBe(1);
    expect(snapshot.confirmedBargeIns[0].aiResponseId).toBe("resp_1");

    expect(snapshot.aiTurns).toHaveLength(1);
    expect(snapshot.aiTurns[0].wasInterrupted).toBe(true);
    expect(snapshot.aiTurns[0].responseStatus).toBe("cancelled");

    // Overlap window: from when the user started (1300ms) to when AI audio actually stopped
    // (1630ms) — the real simultaneous-speech interval, not the whole user turn.
    expect(snapshot.overlaps).toHaveLength(1);
    expect(snapshot.overlaps[0].startMs).toBe(1300);
    expect(snapshot.overlaps[0].endMs).toBe(1630);
    expect(snapshot.overlaps[0].durationMs).toBe(330);
    expect(snapshot.session.overlapCount).toBe(1);
    expect(snapshot.session.totalOverlapMs).toBe(330);

    // One confirmed interruption, one overlap interval — not double-counted in either direction.
    expect(snapshot.session.confirmedInterruptionCount).toBe(1);
    expect(snapshot.session.overlapCount).toBe(1);
  });
});

describe("createSessionTimeline — confirmed barge-in in the response.created-to-audio-start gap", () => {
  it("attributes the confirmed barge-in to the pending response instead of a null aiResponseId, with correct zero overlap since no audio ever played", () => {
    const clock = createClock();
    const timeline = createSessionTimeline({ now: clock.now });

    // A prior AI turn finishes completely and naturally.
    timeline.recordResponseCreated("resp_1");
    clock.advance(200);
    timeline.recordAiAudioStarted("resp_1");
    clock.advance(1000);
    timeline.recordAiAudioStopped("resp_1");
    timeline.recordResponseDone("resp_1", "completed");

    // The server starts generating the NEXT response (create_response: true), but before it ever
    // produces a byte of audio, the user starts talking again.
    clock.advance(50);
    timeline.recordResponseCreated("resp_2");
    clock.advance(80);
    timeline.recordUserSpeechStarted("item_1");

    // Sustained past the confirmation window -> confirmed barge-in, even though resp_2's audio
    // never started (currentAiResponseId is null at this point).
    clock.advance(250);
    timeline.recordConfirmedBargeIn();
    timeline.recordResponseCancelled("resp_2", "confirmed_bargein");
    timeline.recordResponseDone("resp_2", "cancelled"); // resp_2 concludes having never played audio

    clock.advance(500);
    timeline.recordUserSpeechStopped("item_1");
    timeline.recordUserTranscript("item_1", "Actually, hold on.");

    const snapshot = timeline.finalize();

    // Attribution fixed: the confirmed barge-in points at the response it actually interrupted.
    // It is a technical barge-in (session control/diagnostics), but NOT a coaching-relevant
    // audible interruption — no AI audio was ever playing to talk over.
    expect(snapshot.confirmedBargeIns[0].aiResponseId).toBe("resp_2");
    expect(snapshot.confirmedBargeIns[0].context).toBe("pre_playback");
    expect(snapshot.session.technicalBargeInCount).toBe(1);
    expect(snapshot.session.confirmedInterruptionCount).toBe(0);

    // No phantom AiTurnMetric is fabricated for a response that never produced audio — only the
    // one real, completed AI turn exists.
    expect(snapshot.aiTurns).toHaveLength(1);
    expect(snapshot.aiTurns[0].responseId).toBe("resp_1");
    expect(snapshot.aiTurns[0].wasInterrupted).toBe(false);

    // Zero overlap is CORRECT here — no audio was ever playing to overlap with — not a bug.
    expect(snapshot.overlaps).toHaveLength(0);
    expect(snapshot.session.overlapCount).toBe(0);
    expect(snapshot.session.totalOverlapMs).toBe(0);

    // The interrupting user turn is still a real, confirmed turn.
    expect(snapshot.userTurns).toHaveLength(1);
    expect(snapshot.userTurns[0].classification).toBe("confirmed");
  });

  it("does not leave a stale pending response id attributed to a later, unrelated confirmed barge-in", () => {
    const clock = createClock();
    const timeline = createSessionTimeline({ now: clock.now });

    // resp_1 is created and starts playing normally — pendingResponseId should clear.
    timeline.recordResponseCreated("resp_1");
    clock.advance(100);
    timeline.recordAiAudioStarted("resp_1");
    clock.advance(500);
    // A later confirmed barge-in against resp_1 while it's actively playing must attribute to
    // resp_1 itself, not resurface the already-cleared pending id.
    timeline.recordUserSpeechStarted("item_1");
    clock.advance(250);
    timeline.recordConfirmedBargeIn();

    const snapshot = timeline.finalize();
    expect(snapshot.confirmedBargeIns[0].aiResponseId).toBe("resp_1");
  });
});

/**
 * Regression coverage for a product-semantics fix: a technical confirmed barge-in (the barge-in
 * controller cancelled a pending or active response) is NOT the same thing as an audible user
 * interruption (the user spoke over AI audio they could actually hear). A pre-playback
 * cancellation — confirmed after response.created but before output_audio_buffer.started — is a
 * real, useful-for-diagnostics technical event, but must NOT count toward the coaching-facing
 * interruption metric (session.confirmedInterruptionCount), since there was nothing audible to
 * interrupt. session.technicalBargeInCount tracks the raw total for debugging/session control.
 */
describe("createSessionTimeline — audible interruption vs. technical barge-in", () => {
  it("user starts during actual AI playback -> audible interruption = 1", () => {
    const clock = createClock();
    const timeline = createSessionTimeline({ now: clock.now });

    timeline.recordResponseCreated("resp_1");
    clock.advance(200);
    timeline.recordAiAudioStarted("resp_1");
    clock.advance(500);
    timeline.recordUserSpeechStarted("item_1");
    clock.advance(250);
    timeline.recordConfirmedBargeIn();

    const snapshot = timeline.finalize();
    expect(snapshot.confirmedBargeIns).toHaveLength(1);
    expect(snapshot.confirmedBargeIns[0].context).toBe("audible");
    expect(snapshot.session.confirmedInterruptionCount).toBe(1);
    expect(snapshot.session.technicalBargeInCount).toBe(1);
  });

  it("user starts after response.created but before audio playback -> technical barge-in = 1, audible interruption = 0", () => {
    const clock = createClock();
    const timeline = createSessionTimeline({ now: clock.now });

    timeline.recordResponseCreated("resp_1");
    clock.advance(80);
    timeline.recordUserSpeechStarted("item_1"); // before output_audio_buffer.started ever fires
    clock.advance(250);
    timeline.recordConfirmedBargeIn();
    timeline.recordResponseDone("resp_1", "cancelled"); // resp_1 concludes having never played audio

    const snapshot = timeline.finalize();
    expect(snapshot.confirmedBargeIns).toHaveLength(1);
    expect(snapshot.confirmedBargeIns[0].context).toBe("pre_playback");
    expect(snapshot.confirmedBargeIns[0].aiResponseId).toBe("resp_1");
    expect(snapshot.session.confirmedInterruptionCount).toBe(0);
    expect(snapshot.session.technicalBargeInCount).toBe(1);
    // No phantom AI turn is fabricated for a response that never produced audio.
    expect(snapshot.aiTurns).toHaveLength(0);
  });

  it("overlap remains 0 for a pre-playback cancellation", () => {
    const clock = createClock();
    const timeline = createSessionTimeline({ now: clock.now });

    timeline.recordResponseCreated("resp_1");
    clock.advance(80);
    timeline.recordUserSpeechStarted("item_1");
    clock.advance(250);
    timeline.recordConfirmedBargeIn();
    clock.advance(500);
    timeline.recordUserSpeechStopped("item_1");
    timeline.recordUserTranscript("item_1", "Hold on a second.");

    const snapshot = timeline.finalize();
    expect(snapshot.overlaps).toHaveLength(0);
    expect(snapshot.session.overlapCount).toBe(0);
    expect(snapshot.session.totalOverlapMs).toBe(0);
  });

  it("does not double-count across a mix of one audible and one pre-playback barge-in", () => {
    const clock = createClock();
    const timeline = createSessionTimeline({ now: clock.now });

    // Pre-playback barge-in against resp_1.
    timeline.recordResponseCreated("resp_1");
    clock.advance(80);
    timeline.recordUserSpeechStarted("item_1");
    clock.advance(250);
    timeline.recordConfirmedBargeIn();
    timeline.recordResponseDone("resp_1", "cancelled");
    clock.advance(300);
    timeline.recordUserSpeechStopped("item_1");
    timeline.recordUserTranscript("item_1", "Actually, never mind.");

    // Later, a genuine audible barge-in against resp_2.
    clock.advance(500);
    timeline.recordResponseCreated("resp_2");
    clock.advance(200);
    timeline.recordAiAudioStarted("resp_2");
    clock.advance(600);
    timeline.recordUserSpeechStarted("item_2");
    clock.advance(250);
    timeline.recordConfirmedBargeIn();
    clock.advance(100);
    timeline.recordAiAudioStopped("resp_2");
    timeline.recordResponseDone("resp_2", "cancelled");
    clock.advance(400);
    timeline.recordUserSpeechStopped("item_2");
    timeline.recordUserTranscript("item_2", "Wait, let me jump in.");

    const snapshot = timeline.finalize();

    // Two technical barge-ins total, but only one was audible.
    expect(snapshot.confirmedBargeIns).toHaveLength(2);
    expect(snapshot.session.technicalBargeInCount).toBe(2);
    expect(snapshot.session.confirmedInterruptionCount).toBe(1);
    expect(snapshot.confirmedBargeIns.filter((b) => b.context === "audible")).toHaveLength(1);
    expect(snapshot.confirmedBargeIns.filter((b) => b.context === "pre_playback")).toHaveLength(1);

    // Only the one real (played) AI turn exists — resp_1 never produced audio, so no phantom turn.
    expect(snapshot.aiTurns).toHaveLength(1);
    expect(snapshot.aiTurns[0].responseId).toBe("resp_2");
    expect(snapshot.aiTurns[0].wasInterrupted).toBe(true);

    // Only the audible barge-in against resp_2 produces overlap; the pre-playback one contributes none.
    expect(snapshot.session.overlapCount).toBe(1);
    expect(snapshot.overlaps[0].aiResponseId).toBe("resp_2");
  });
});

/**
 * Regression coverage for a production report: total_ai_speaking_ms (~156s) exceeding
 * total_duration_ms (~102s), 153% ai_speaking_percentage, 50s/7-event overlap, and
 * confirmed_interruption_count = 2 for one deliberate interruption. Root cause: response.cancel
 * alone does not drain/stop the output audio buffer, so a genuinely interrupted AI turn's
 * output_audio_buffer.stopped could arrive very late or never, leaving that turn open until
 * finalize() closed it with the full session's elapsed time — inflating AI speaking time, causing
 * it to overlap with nearly every later user turn, and hiding it from "preceding AI turn" searches
 * (forcing response latency to be measured against a much older, unrelated turn instead). Fixed by
 * also sending/handling output_audio_buffer.clear/.cleared, and by closing any AI turn still open
 * when response.done arrives with a non-"completed" status. Separately, repeated confirmed
 * barge-ins against the same still-active AI response (VAD segmenting one interruption into two
 * raw utterances, or the same staying-open bug letting a second raw confirmation land) are now
 * idempotent per AI response for the coaching-facing interruption count.
 */
describe("createSessionTimeline — AI turn lifecycle integrity", () => {
  it("records several sequential AI turns without any overlapping intervals", () => {
    const clock = createClock();
    const timeline = createSessionTimeline({ now: clock.now });

    for (let i = 1; i <= 4; i++) {
      timeline.recordResponseCreated(`resp_${i}`);
      clock.advance(150);
      timeline.recordAiAudioStarted(`resp_${i}`);
      clock.advance(3000);
      timeline.recordAiAudioStopped(`resp_${i}`);
      timeline.recordResponseDone(`resp_${i}`, "completed");
      clock.advance(2000); // gap for a user turn in between, not modeled here
    }

    const snapshot = timeline.finalize();
    expect(snapshot.aiTurns).toHaveLength(4);
    expect(snapshot.invariantViolations).toEqual([]);
    expect(snapshot.session.totalAiSpeakingMs).toBeLessThanOrEqual(snapshot.session.totalDurationMs);
  });

  it("closes an interrupted AI turn promptly via output_audio_buffer.cleared, so a new AI response afterward does not overlap it", () => {
    const clock = createClock();
    const timeline = createSessionTimeline({ now: clock.now });

    // resp_1 starts playing, gets interrupted 1s in.
    timeline.recordResponseCreated("resp_1");
    clock.advance(100);
    timeline.recordAiAudioStarted("resp_1");
    clock.advance(1000);
    timeline.recordUserSpeechStarted("item_1");
    clock.advance(250);
    timeline.recordConfirmedBargeIn();
    timeline.recordResponseCancelled("resp_1", "confirmed_bargein");
    // The client also sends output_audio_buffer.clear — the server confirms with .cleared shortly after.
    clock.advance(20);
    timeline.recordAiAudioCleared("resp_1");
    timeline.recordResponseDone("resp_1", "cancelled");
    clock.advance(300);
    timeline.recordUserSpeechStopped("item_1");
    timeline.recordUserTranscript("item_1", "Hold on, let me say something.");

    // A brand new AI response plays afterward, much later.
    clock.advance(5000);
    timeline.recordResponseCreated("resp_2");
    clock.advance(150);
    timeline.recordAiAudioStarted("resp_2");
    clock.advance(4000);
    timeline.recordAiAudioStopped("resp_2");
    timeline.recordResponseDone("resp_2", "completed");

    const snapshot = timeline.finalize();
    expect(snapshot.aiTurns).toHaveLength(2);
    const resp1 = snapshot.aiTurns.find((t) => t.responseId === "resp_1")!;
    // Closed promptly (start 100 -> end 1370, NOT dragged out to session end).
    expect(resp1.endMs).toBe(1370);
    expect(resp1.durationMs).toBe(1270);
    expect(resp1.wasInterrupted).toBe(true);
    expect(snapshot.invariantViolations).toEqual([]);
  });

  it("treats a late output_audio_buffer.stopped after cancellation as a no-op, not a reopened/extended turn", () => {
    const clock = createClock();
    const timeline = createSessionTimeline({ now: clock.now });

    timeline.recordResponseCreated("resp_1");
    clock.advance(100);
    timeline.recordAiAudioStarted("resp_1");
    clock.advance(500);
    timeline.recordUserSpeechStarted("item_1");
    clock.advance(250);
    timeline.recordConfirmedBargeIn();
    clock.advance(20);
    timeline.recordAiAudioCleared("resp_1"); // closes the turn at 870ms
    timeline.recordResponseDone("resp_1", "cancelled");

    // A residual output_audio_buffer.stopped arrives much later (whatever tiny bit of buffered
    // audio finally finished draining) — must not reopen or extend the already-closed turn.
    clock.advance(4000);
    timeline.recordAiAudioStopped("resp_1");

    clock.advance(200);
    timeline.recordUserSpeechStopped("item_1");
    timeline.recordUserTranscript("item_1", "Wait, stop.");

    const snapshot = timeline.finalize();
    expect(snapshot.aiTurns).toHaveLength(1);
    expect(snapshot.aiTurns[0].endMs).toBe(870);
    expect(snapshot.aiTurns[0].durationMs).toBe(770);
  });

  it("ignores stale/duplicate Realtime events without double-counting or corrupting the timeline", () => {
    const clock = createClock();
    const timeline = createSessionTimeline({ now: clock.now });

    timeline.recordResponseCreated("resp_1");
    timeline.recordResponseCreated("resp_1"); // duplicate created
    clock.advance(150);
    timeline.recordAiAudioStarted("resp_1");
    timeline.recordAiAudioStarted("resp_1"); // duplicate started
    clock.advance(2000);
    timeline.recordAiAudioCleared("resp_1");
    timeline.recordAiAudioCleared("resp_1"); // duplicate cleared
    timeline.recordAiAudioStopped("resp_1"); // duplicate via the other event name too
    timeline.recordResponseDone("resp_1", "cancelled");
    timeline.recordResponseDone("resp_1", "cancelled"); // duplicate done

    const snapshot = timeline.finalize();
    expect(snapshot.aiTurns).toHaveLength(1);
    expect(snapshot.aiTurns[0].durationMs).toBe(2000);
    expect(snapshot.invariantViolations).toEqual([]);
  });

  it("counts one real audible interruption exactly once even when the server's VAD reports it as two raw speech segments", () => {
    const clock = createClock();
    const timeline = createSessionTimeline({ now: clock.now });

    timeline.recordResponseCreated("resp_1");
    clock.advance(100);
    timeline.recordAiAudioStarted("resp_1");
    clock.advance(1000);

    // First raw segment of the user's interruption confirms.
    timeline.recordUserSpeechStarted("item_1a");
    clock.advance(250);
    timeline.recordConfirmedBargeIn();

    // A brief natural pause mid-utterance: VAD reports speech_stopped then speech_started again for
    // what the user experiences as one continuous interruption of the SAME still-active response.
    clock.advance(50);
    timeline.recordUserSpeechStopped("item_1a");
    timeline.recordUserTranscript("item_1a", "Wait");
    clock.advance(30);
    timeline.recordUserSpeechStarted("item_1b");
    clock.advance(250);
    timeline.recordConfirmedBargeIn(); // fires again against the same still-open resp_1

    clock.advance(20);
    timeline.recordAiAudioCleared("resp_1");
    timeline.recordResponseDone("resp_1", "cancelled");
    clock.advance(300);
    timeline.recordUserSpeechStopped("item_1b");
    timeline.recordUserTranscript("item_1b", "let me finish this thought.");

    const snapshot = timeline.finalize();
    expect(snapshot.confirmedBargeIns).toHaveLength(2);
    expect(snapshot.session.technicalBargeInCount).toBe(2);
    // Exactly one counted audible interruption for the coaching-facing metric.
    expect(snapshot.session.confirmedInterruptionCount).toBe(1);
    expect(snapshot.confirmedBargeIns[0].countsTowardInterruption).toBe(true);
    expect(snapshot.confirmedBargeIns[1].countsTowardInterruption).toBe(false);
  });

  it("does not let a false echo event become a second coaching-facing interruption", () => {
    const clock = createClock();
    const timeline = createSessionTimeline({ now: clock.now });

    // A genuine, confirmed interruption of resp_1.
    timeline.recordResponseCreated("resp_1");
    clock.advance(100);
    timeline.recordAiAudioStarted("resp_1");
    clock.advance(800);
    timeline.recordUserSpeechStarted("item_1");
    clock.advance(250);
    timeline.recordConfirmedBargeIn();
    clock.advance(20);
    timeline.recordAiAudioCleared("resp_1");
    timeline.recordResponseDone("resp_1", "cancelled");
    clock.advance(300);
    timeline.recordUserSpeechStopped("item_1");
    timeline.recordUserTranscript("item_1", "Actually, wait.");

    // Later, a new AI turn plays, and a brief echo blip occurs during it — never confirmed by the
    // barge-in controller (no recordConfirmedBargeIn call), so it must never inflate the
    // coaching-facing count no matter what transcript text it happens to produce.
    clock.advance(1000);
    timeline.recordResponseCreated("resp_2");
    clock.advance(150);
    timeline.recordAiAudioStarted("resp_2");
    clock.advance(500);
    timeline.recordUserSpeechStarted("item_echo");
    clock.advance(60);
    timeline.recordUserSpeechStopped("item_echo"); // stops before confirmation - a blip, no barge-in
    clock.advance(2000);
    timeline.recordAiAudioStopped("resp_2");
    timeline.recordResponseDone("resp_2", "completed");

    const snapshot = timeline.finalize();
    expect(snapshot.session.confirmedInterruptionCount).toBe(1);
    expect(snapshot.session.technicalBargeInCount).toBe(1);
    const echoTurn = snapshot.userTurns.find((t) => t.itemId === "item_echo")!;
    expect(echoTurn.classification).toBe("suspected_noise");
  });

  it("keeps AI speaking time within session duration for a normal multi-turn single-stream conversation", () => {
    const clock = createClock();
    const timeline = createSessionTimeline({ now: clock.now });

    // Opening line.
    timeline.recordResponseCreated("resp_1");
    clock.advance(100);
    timeline.recordAiAudioStarted("resp_1");
    clock.advance(3000);
    timeline.recordAiAudioStopped("resp_1");
    timeline.recordResponseDone("resp_1", "completed");

    // Three ordinary user <-> AI exchanges.
    for (let i = 2; i <= 4; i++) {
      clock.advance(800);
      timeline.recordUserSpeechStarted(`item_${i}`);
      clock.advance(2500);
      timeline.recordUserSpeechStopped(`item_${i}`);
      timeline.recordUserTranscript(`item_${i}`, "A normal reply.");

      clock.advance(600);
      timeline.recordResponseCreated(`resp_${i}`);
      clock.advance(150);
      timeline.recordAiAudioStarted(`resp_${i}`);
      clock.advance(3200);
      timeline.recordAiAudioStopped(`resp_${i}`);
      timeline.recordResponseDone(`resp_${i}`, "completed");
    }

    const snapshot = timeline.finalize();
    expect(snapshot.session.totalAiSpeakingMs).toBeLessThanOrEqual(snapshot.session.totalDurationMs);
    expect(snapshot.session.aiSpeakingPercentage).toBeGreaterThanOrEqual(0);
    expect(snapshot.session.aiSpeakingPercentage).toBeLessThanOrEqual(100);
    expect(snapshot.session.userSpeakingPercentage).toBeGreaterThanOrEqual(0);
    expect(snapshot.session.userSpeakingPercentage).toBeLessThanOrEqual(100);
    expect(snapshot.invariantViolations).toEqual([]);
  });

  it("bounds total overlap by both total user speaking time and total AI speaking time", () => {
    const clock = createClock();
    const timeline = createSessionTimeline({ now: clock.now });

    timeline.recordResponseCreated("resp_1");
    clock.advance(100);
    timeline.recordAiAudioStarted("resp_1");
    clock.advance(1000);
    // Genuine overlap: user speaks over the last portion of resp_1's playback.
    timeline.recordUserSpeechStarted("item_1");
    clock.advance(300);
    timeline.recordAiAudioStopped("resp_1");
    timeline.recordResponseDone("resp_1", "completed");
    clock.advance(500);
    timeline.recordUserSpeechStopped("item_1");
    timeline.recordUserTranscript("item_1", "I wanted to add something.");

    const snapshot = timeline.finalize();
    const maxAllowedOverlap = Math.min(snapshot.session.totalUserSpeakingMs, snapshot.session.totalAiSpeakingMs);
    expect(snapshot.session.totalOverlapMs).toBeLessThanOrEqual(maxAllowedOverlap);
    expect(snapshot.invariantViolations).toEqual([]);
  });

  it("pairs response latency with the correct immediately-preceding audible AI turn, not a stale earlier one", () => {
    const clock = createClock();
    const timeline = createSessionTimeline({ now: clock.now });

    // An earlier AI turn gets interrupted and closes promptly (the fix under test).
    timeline.recordResponseCreated("resp_1");
    clock.advance(100);
    timeline.recordAiAudioStarted("resp_1");
    clock.advance(1000);
    timeline.recordUserSpeechStarted("item_interrupt");
    clock.advance(250);
    timeline.recordConfirmedBargeIn();
    clock.advance(20);
    timeline.recordAiAudioCleared("resp_1"); // resp_1 ends at 1370ms
    timeline.recordResponseDone("resp_1", "cancelled");
    clock.advance(300);
    timeline.recordUserSpeechStopped("item_interrupt");
    timeline.recordUserTranscript("item_interrupt", "Wait, let me say this.");

    // The AI's actual reply to the interruption plays out fully afterward.
    clock.advance(400);
    timeline.recordResponseCreated("resp_2");
    clock.advance(150);
    timeline.recordAiAudioStarted("resp_2");
    clock.advance(2000);
    timeline.recordAiAudioStopped("resp_2"); // resp_2 ends at 1370+300+400+150+2000 = 4220ms
    timeline.recordResponseDone("resp_2", "completed");

    // The user responds after a clean 600ms gap.
    clock.advance(600);
    timeline.recordUserSpeechStarted("item_reply");
    clock.advance(1200);
    timeline.recordUserSpeechStopped("item_reply");
    timeline.recordUserTranscript("item_reply", "Okay, that makes sense.");

    const snapshot = timeline.finalize();
    // Latency must be measured against resp_2 (the turn the user actually heard just before
    // replying), not resp_1 (which ended much earlier and is unrelated to this exchange).
    expect(snapshot.session.avgUserResponseLatencyMs).toBe(600);
  });
});

/**
 * Regression coverage for a production control test: one deliberate, audible interruption came
 * back as confirmed_interruption_count = 0 and overlap = 0.8ms across 2 events. Root cause:
 * audible-vs-pre_playback classification and attribution were computed by re-reading
 * currentAiResponseId/pendingResponseId at CONFIRMATION time (250ms-1500ms after speech started),
 * not at the moment the candidate interruption interval actually began — by confirmation time the
 * AI turn may have already closed for a reason unrelated to the interruption, silently
 * misclassifying a genuine mid-playback interruption as pre_playback. Fixed by snapshotting
 * currentAiResponseId/pendingResponseId onto the user turn at recordUserSpeechStarted() time and
 * reading that snapshot, not live state, in recordConfirmedBargeIn(). Overlap/response latency
 * were independently re-verified to already use only the client monotonic clock end to end (never
 * mixing in the server's separate audio_start_ms/audio_end_ms clock), so no cross-clock bug was
 * found there — the near-zero overlap was a downstream symptom of the same misclassification, not
 * a separate defect.
 */
describe("createSessionTimeline — audible classification uses state at speech-start, not confirmation time", () => {
  it("classifies a genuine mid-playback interruption as audible even if the AI turn closes before confirmation fires (reproduces the production event ordering)", () => {
    const clock = createClock();
    const timeline = createSessionTimeline({ now: clock.now });

    timeline.recordResponseCreated("resp_1");
    clock.advance(100);
    timeline.recordAiAudioStarted("resp_1");
    clock.advance(500);
    // User starts speaking while resp_1 is genuinely, audibly playing.
    timeline.recordUserSpeechStarted("item_1");

    // Before the barge-in controller's confirmation timer elapses, resp_1 closes for a reason
    // unrelated to this interruption (e.g. it happened to finish at nearly the same moment) — the
    // exact scenario that made the OLD "check state now" logic misclassify this as pre_playback.
    clock.advance(50);
    timeline.recordAiAudioStopped("resp_1");
    timeline.recordResponseDone("resp_1", "completed");

    // The confirmation timer fires later, well after resp_1 has already closed.
    clock.advance(200);
    timeline.recordConfirmedBargeIn();
    clock.advance(300);
    timeline.recordUserSpeechStopped("item_1");
    timeline.recordUserTranscript("item_1", "Wait, I wanted to say something.");

    const snapshot = timeline.finalize();
    // Must be classified audible — the AI genuinely was playing when this speech interval began —
    // even though by confirmation time the turn had already closed.
    expect(snapshot.confirmedBargeIns[0].context).toBe("audible");
    expect(snapshot.confirmedBargeIns[0].aiResponseId).toBe("resp_1");
    expect(snapshot.session.confirmedInterruptionCount).toBe(1);
    expect(snapshot.aiTurns[0].wasInterrupted).toBe(true);
  });

  it("still classifies pre_playback correctly when the AI truly was never playing at speech-start time", () => {
    const clock = createClock();
    const timeline = createSessionTimeline({ now: clock.now });

    timeline.recordResponseCreated("resp_1"); // created, but never starts playing
    clock.advance(80);
    timeline.recordUserSpeechStarted("item_1");
    clock.advance(250);
    timeline.recordConfirmedBargeIn();
    timeline.recordResponseDone("resp_1", "cancelled");

    const snapshot = timeline.finalize();
    expect(snapshot.confirmedBargeIns[0].context).toBe("pre_playback");
    expect(snapshot.session.confirmedInterruptionCount).toBe(0);
    expect(snapshot.session.technicalBargeInCount).toBe(1);
  });

  it("records the at-start snapshot on UserTurnMetric.audibleAiResponseIdAtStart, matching the AI turn actually interrupted", () => {
    const clock = createClock();
    const timeline = createSessionTimeline({ now: clock.now });

    timeline.recordResponseCreated("resp_1");
    clock.advance(100);
    timeline.recordAiAudioStarted("resp_1");
    clock.advance(500);
    timeline.recordUserSpeechStarted("item_1");
    clock.advance(250);
    timeline.recordConfirmedBargeIn();
    clock.advance(20);
    timeline.recordAiAudioCleared("resp_1");
    timeline.recordResponseDone("resp_1", "cancelled");
    clock.advance(300);
    timeline.recordUserSpeechStopped("item_1");
    timeline.recordUserTranscript("item_1", "Hold on.");

    const snapshot = timeline.finalize();
    const turn = snapshot.userTurns.find((t) => t.itemId === "item_1")!;
    expect(turn.audibleAiResponseIdAtStart).toBe("resp_1");

    // A user turn whose speech began with no AI audio playing must record null.
    expect(snapshot.userTurns.every((t) => t.itemId !== "item_1" || t.audibleAiResponseIdAtStart === "resp_1")).toBe(true);
  });

  it("produces a plausible positive overlap for a genuine mid-playback interruption, reproducing the production control-test scenario end to end", () => {
    const clock = createClock();
    const timeline = createSessionTimeline({ now: clock.now });

    timeline.recordResponseCreated("resp_1");
    clock.advance(100);
    timeline.recordAiAudioStarted("resp_1");
    clock.advance(2000); // AI has been audibly speaking for 2s
    timeline.recordUserSpeechStarted("item_1"); // user starts speaking over it
    clock.advance(250); // standard confirmation window
    timeline.recordConfirmedBargeIn();
    clock.advance(80); // network round trip for cancel+clear to take effect
    timeline.recordAiAudioCleared("resp_1");
    timeline.recordResponseDone("resp_1", "cancelled");
    clock.advance(400);
    timeline.recordUserSpeechStopped("item_1");
    timeline.recordUserTranscript("item_1", "Actually, let me stop you there.");

    const snapshot = timeline.finalize();
    expect(snapshot.session.confirmedInterruptionCount).toBe(1);
    expect(snapshot.overlaps).toHaveLength(1);
    // Overlap spans from when the user started to when the AI's audio actually stopped — at least
    // the confirmation window's worth of genuinely simultaneous speech, never a near-zero sliver.
    expect(snapshot.overlaps[0].durationMs).toBeGreaterThan(250);
    expect(snapshot.session.totalOverlapMs).toBeGreaterThan(250);
  });

  it("verifies overlap never mixes the server audio clock with the client clock (both startMs/endMs are client-clock only)", () => {
    const clock = createClock();
    const timeline = createSessionTimeline({ now: clock.now });

    // Server audio_start_ms/audio_end_ms deliberately set to values wildly different from the
    // client elapsed() clock, to prove overlap computation is unaffected by them.
    timeline.recordResponseCreated("resp_1");
    clock.advance(100);
    timeline.recordAiAudioStarted("resp_1");
    clock.advance(1000);
    timeline.recordUserSpeechStarted("item_1", 999999); // server clock: totally different origin
    clock.advance(300);
    timeline.recordAiAudioStopped("resp_1");
    timeline.recordResponseDone("resp_1", "completed");
    clock.advance(200);
    timeline.recordUserSpeechStopped("item_1", 1000500); // server duration would be 501ms
    timeline.recordUserTranscript("item_1", "I have a question.");

    const snapshot = timeline.finalize();
    // durationMs legitimately prefers the server clock (501ms) for this one figure, but the
    // interval used for overlap (startMs/endMs) must stay entirely on the client clock.
    const userTurn = snapshot.userTurns[0];
    expect(userTurn.durationSource).toBe("server_vad");
    expect(userTurn.durationMs).toBe(501);
    expect(userTurn.startMs).toBe(1100); // client clock, not anywhere near 999999
    expect(userTurn.endMs).toBe(1600);
    expect(snapshot.overlaps).toHaveLength(1);
    expect(snapshot.overlaps[0].durationMs).toBe(300); // computed entirely from client-clock values
  });
});
