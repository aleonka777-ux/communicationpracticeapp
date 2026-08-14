import { describe, expect, it } from "vitest";
import { transition, type SimulationState } from "@/lib/simulation/stateMachine";

describe("simulation state machine", () => {
  it("walks the happy path for a typed turn", () => {
    let state: SimulationState = "preparing";
    state = transition(state, { type: "PREPARED" });
    expect(state).toBe("interlocutor_speaking");
    state = transition(state, { type: "SPEECH_FINISHED" });
    expect(state).toBe("ready");
    state = transition(state, { type: "SUBMIT_MESSAGE" });
    expect(state).toBe("interlocutor_thinking");
    state = transition(state, { type: "REPLY_RECEIVED" });
    expect(state).toBe("interlocutor_speaking");
    state = transition(state, { type: "SPEECH_FINISHED" });
    expect(state).toBe("ready");
  });

  it("walks the happy path for a voice turn", () => {
    let state: SimulationState = "ready";
    state = transition(state, { type: "START_RECORDING" });
    expect(state).toBe("recording");
    state = transition(state, { type: "STOP_RECORDING" });
    expect(state).toBe("transcribing");
    state = transition(state, { type: "TRANSCRIBED" });
    expect(state).toBe("interlocutor_thinking");
  });

  it("supports the training-mode hint pause and resume", () => {
    let state: SimulationState = "ready";
    state = transition(state, { type: "REQUEST_HINT" });
    expect(state).toBe("paused_for_hint");
    state = transition(state, { type: "HINT_RECEIVED" });
    expect(state).toBe("ready");
  });

  it("ends the session and runs evaluation", () => {
    let state: SimulationState = "ready";
    state = transition(state, { type: "END_PRACTICE" });
    expect(state).toBe("ending");
    state = transition(state, { type: "EVALUATION_STARTED" });
    expect(state).toBe("evaluating");
    state = transition(state, { type: "EVALUATION_COMPLETE" });
    expect(state).toBe("complete");
  });

  it("never shows two conflicting activities: recording ignores a competing SUBMIT_MESSAGE", () => {
    const state: SimulationState = "recording";
    expect(transition(state, { type: "SUBMIT_MESSAGE" })).toBe("recording");
  });

  it("ignores illegal transitions as a no-op", () => {
    expect(transition("interlocutor_thinking", { type: "STOP_RECORDING" })).toBe("interlocutor_thinking");
    expect(transition("complete", { type: "SUBMIT_MESSAGE" })).toBe("complete");
    expect(transition("evaluating", { type: "SUBMIT_MESSAGE" })).toBe("evaluating");
  });

  it("can end practice early from mid-conversation states", () => {
    expect(transition("interlocutor_thinking", { type: "END_PRACTICE" })).toBe("ending");
    expect(transition("paused_for_hint", { type: "END_PRACTICE" })).toBe("ending");
    expect(transition("recording", { type: "END_PRACTICE" })).toBe("ending");
  });

  it("recovers from an error back to ready via RETRY", () => {
    const errored = transition("interlocutor_thinking", { type: "ERROR" });
    expect(errored).toBe("error");
    expect(transition(errored, { type: "RETRY" })).toBe("ready");
  });

  it("times out from ready and thinking straight into ending", () => {
    expect(transition("ready", { type: "TIME_UP" })).toBe("ending");
    expect(transition("interlocutor_thinking", { type: "TIME_UP" })).toBe("ending");
  });
});
