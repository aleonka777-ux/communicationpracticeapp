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
