import { describe, expect, it } from "vitest";
import { transitionRealtimeConnection, type RealtimeConnectionState } from "@/lib/realtime/connectionState";

describe("realtime connection state machine", () => {
  it("walks the happy path for one full turn", () => {
    let state: RealtimeConnectionState = "connecting";
    state = transitionRealtimeConnection(state, { type: "CONNECTED" });
    expect(state).toBe("listening");
    state = transitionRealtimeConnection(state, { type: "USER_STARTED_SPEAKING" });
    expect(state).toBe("user_speaking");
    state = transitionRealtimeConnection(state, { type: "USER_STOPPED_SPEAKING" });
    expect(state).toBe("thinking");
    state = transitionRealtimeConnection(state, { type: "AI_STARTED_SPEAKING" });
    expect(state).toBe("speaking");
    state = transitionRealtimeConnection(state, { type: "AI_FINISHED_SPEAKING" });
    expect(state).toBe("listening");
  });

  it("allows a barge-in: the user speaking while the AI is speaking moves straight to user_speaking", () => {
    expect(transitionRealtimeConnection("speaking", { type: "USER_STARTED_SPEAKING" })).toBe("user_speaking");
  });

  it("allows the AI to start speaking directly from listening (skips an explicit thinking step if the server does)", () => {
    expect(transitionRealtimeConnection("listening", { type: "AI_STARTED_SPEAKING" })).toBe("speaking");
  });

  it("ends the session and runs evaluation", () => {
    let state: RealtimeConnectionState = "listening";
    state = transitionRealtimeConnection(state, { type: "END_PRACTICE" });
    expect(state).toBe("ending");
    state = transitionRealtimeConnection(state, { type: "EVALUATION_STARTED" });
    expect(state).toBe("evaluating");
    state = transitionRealtimeConnection(state, { type: "EVALUATION_COMPLETE" });
    expect(state).toBe("complete");
  });

  it("can end practice early from any active state", () => {
    expect(transitionRealtimeConnection("user_speaking", { type: "END_PRACTICE" })).toBe("ending");
    expect(transitionRealtimeConnection("thinking", { type: "END_PRACTICE" })).toBe("ending");
    expect(transitionRealtimeConnection("speaking", { type: "END_PRACTICE" })).toBe("ending");
    expect(transitionRealtimeConnection("connecting", { type: "END_PRACTICE" })).toBe("ending");
  });

  it("times out from any active state straight into ending", () => {
    expect(transitionRealtimeConnection("listening", { type: "TIME_UP" })).toBe("ending");
    expect(transitionRealtimeConnection("speaking", { type: "TIME_UP" })).toBe("ending");
  });

  it("recovers from an error back to connecting via RETRY", () => {
    const errored = transitionRealtimeConnection("listening", { type: "ERROR" });
    expect(errored).toBe("error");
    expect(transitionRealtimeConnection(errored, { type: "RETRY" })).toBe("connecting");
  });

  it("ignores illegal transitions as a no-op", () => {
    expect(transitionRealtimeConnection("complete", { type: "USER_STARTED_SPEAKING" })).toBe("complete");
    expect(transitionRealtimeConnection("evaluating", { type: "USER_STARTED_SPEAKING" })).toBe("evaluating");
    expect(transitionRealtimeConnection("connecting", { type: "AI_STARTED_SPEAKING" })).toBe("connecting");
  });

  // Response-stall incident fix — see /docs/DECISIONS.md "Response-stall incident", Part B/G.
  it("does not remain stuck in thinking indefinitely: a proven-failed response (AI_FINISHED_SPEAKING while thinking) falls back to listening", () => {
    expect(transitionRealtimeConnection("thinking", { type: "AI_FINISHED_SPEAKING" })).toBe("listening");
  });
});

// State-machine race: Thinking shown during audible AI playback — see /docs/DECISIONS.md.
describe("realtime connection state machine — user-stop / AI-speaking race", () => {
  it("1. normal: user stops with no AI turn in flight -> thinking -> AI starts -> speaking", () => {
    let state: RealtimeConnectionState = "listening";
    state = transitionRealtimeConnection(state, { type: "USER_STARTED_SPEAKING" });
    expect(state).toBe("user_speaking");
    state = transitionRealtimeConnection(state, { type: "USER_STOPPED_SPEAKING", aiSpeaking: false });
    expect(state).toBe("thinking");
    state = transitionRealtimeConnection(state, { type: "AI_STARTED_SPEAKING" });
    expect(state).toBe("speaking");
  });

  it("2. production race reproduced: AI starts while the user is still mid-turn -> state stays/becomes speaking, never thinking, once the user stops", () => {
    // user_turn 9 starts (thinking -> user_speaking)
    let state: RealtimeConnectionState = "thinking";
    state = transitionRealtimeConnection(state, { type: "USER_STARTED_SPEAKING" });
    expect(state).toBe("user_speaking");

    // ai_turn 8 starts ~683ms later, while the user is still talking (production: 101535.4 -> 102218.2)
    state = transitionRealtimeConnection(state, { type: "AI_STARTED_SPEAKING" });
    expect(state).toBe("speaking");

    // user_turn 9 stops ~46.7ms after the AI started (production: 102218.2 -> 102264.9) — must NOT
    // become "thinking" even though the dispatch is still USER_STOPPED_SPEAKING.
    state = transitionRealtimeConnection(state, { type: "USER_STOPPED_SPEAKING", aiSpeaking: true });
    expect(state).toBe("speaking");
  });

  it("3. reverse order: AI already speaking before the user starts (barge-in-shaped overlap) -> user stops while AI still speaking -> stays speaking", () => {
    let state: RealtimeConnectionState = "speaking"; // AI already genuinely playing
    state = transitionRealtimeConnection(state, { type: "USER_STARTED_SPEAKING" });
    expect(state).toBe("user_speaking");
    // AI never stopped in between — real evidence says aiSpeaking is still true.
    state = transitionRealtimeConnection(state, { type: "USER_STOPPED_SPEAKING", aiSpeaking: true });
    expect(state).toBe("speaking");
  });

  it("4. AI stops after the user already stopped -> correct subsequent state (listening)", () => {
    let state: RealtimeConnectionState = "speaking";
    state = transitionRealtimeConnection(state, { type: "USER_STARTED_SPEAKING" });
    state = transitionRealtimeConnection(state, { type: "USER_STOPPED_SPEAKING", aiSpeaking: true });
    expect(state).toBe("speaking");
    state = transitionRealtimeConnection(state, { type: "AI_FINISHED_SPEAKING" });
    expect(state).toBe("listening");
  });

  it("does not use the aiSpeaking override when AI is genuinely not speaking — user_speaking -> thinking still works normally", () => {
    expect(transitionRealtimeConnection("user_speaking", { type: "USER_STOPPED_SPEAKING", aiSpeaking: false })).toBe("thinking");
    expect(transitionRealtimeConnection("user_speaking", { type: "USER_STOPPED_SPEAKING" })).toBe("thinking");
  });

  it("the aiSpeaking override only applies to USER_STOPPED_SPEAKING from user_speaking, not other states/events", () => {
    // Unrelated event + aiSpeaking present should not do anything unexpected.
    expect(transitionRealtimeConnection("listening", { type: "USER_STARTED_SPEAKING", aiSpeaking: true })).toBe("user_speaking");
    // USER_STOPPED_SPEAKING has no effect at all from states other than user_speaking.
    expect(transitionRealtimeConnection("listening", { type: "USER_STOPPED_SPEAKING", aiSpeaking: true })).toBe("listening");
  });

  // 5. Genuine response-stall behavior (unrelated to this race) must remain intact: with no AI turn
  // in flight at all, the user stopping still correctly enters — and stays in — "thinking" long
  // enough for the (component-level) 12s watchdog to observe it; this fix must not change that path.
  it("5. a genuinely stalled response (no AI turn at all) still enters thinking and stays there under further unrelated events, exactly as before this fix", () => {
    let state: RealtimeConnectionState = "listening";
    state = transitionRealtimeConnection(state, { type: "USER_STARTED_SPEAKING" });
    state = transitionRealtimeConnection(state, { type: "USER_STOPPED_SPEAKING", aiSpeaking: false });
    expect(state).toBe("thinking");
    // No AI_STARTED_SPEAKING ever arrives (the stall) — state must remain "thinking" for the
    // watchdog to eventually observe, not silently move on its own.
    expect(transitionRealtimeConnection(state, { type: "USER_STARTED_SPEAKING" })).toBe("user_speaking");
    // The existing lifecycle-proven recovery (a definitively-failed response) still works exactly
    // as it did before this change.
    expect(transitionRealtimeConnection(state, { type: "AI_FINISHED_SPEAKING" })).toBe("listening");
  });
});
