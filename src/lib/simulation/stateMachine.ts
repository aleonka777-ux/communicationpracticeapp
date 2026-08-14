/**
 * Explicit conversation state machine (see /docs/ARCHITECTURE.md §8). Only transitions listed in
 * `TRANSITIONS` are possible — anything else is a no-op, which is what guarantees the UI can
 * never show two conflicting activities (e.g. recording while the interlocutor is "speaking") at
 * once. Drive this with `useReducer(transition, "preparing")` in the simulation screen.
 */

export type SimulationState =
  | "preparing"
  | "ready"
  | "interlocutor_speaking"
  | "listening"
  | "recording"
  | "transcribing"
  | "interlocutor_thinking"
  | "paused_for_hint"
  | "ending"
  | "evaluating"
  | "complete"
  | "error";

export type SimulationEventType =
  | "PREPARED"
  | "SPEECH_FINISHED"
  | "START_RECORDING"
  | "STOP_RECORDING"
  | "TRANSCRIBED"
  | "SUBMIT_MESSAGE"
  | "REPLY_RECEIVED"
  | "REQUEST_HINT"
  | "HINT_RECEIVED"
  | "END_PRACTICE"
  | "TIME_UP"
  | "EVALUATION_STARTED"
  | "EVALUATION_COMPLETE"
  | "ERROR"
  | "RETRY";

export interface SimulationEvent {
  type: SimulationEventType;
  message?: string;
}

type TransitionTable = Record<SimulationState, Partial<Record<SimulationEventType, SimulationState>>>;

const TRANSITIONS: TransitionTable = {
  preparing: {
    PREPARED: "interlocutor_speaking",
    ERROR: "error",
  },
  interlocutor_speaking: {
    SPEECH_FINISHED: "ready",
    END_PRACTICE: "ending",
    TIME_UP: "ending",
    ERROR: "error",
  },
  ready: {
    START_RECORDING: "recording",
    SUBMIT_MESSAGE: "interlocutor_thinking",
    REQUEST_HINT: "paused_for_hint",
    END_PRACTICE: "ending",
    TIME_UP: "ending",
    ERROR: "error",
  },
  recording: {
    STOP_RECORDING: "transcribing",
    END_PRACTICE: "ending",
    ERROR: "error",
  },
  listening: {
    TRANSCRIBED: "interlocutor_thinking",
    END_PRACTICE: "ending",
    ERROR: "error",
  },
  transcribing: {
    TRANSCRIBED: "interlocutor_thinking",
    END_PRACTICE: "ending",
    ERROR: "error",
  },
  interlocutor_thinking: {
    REPLY_RECEIVED: "interlocutor_speaking",
    TIME_UP: "ending",
    END_PRACTICE: "ending",
    ERROR: "error",
  },
  paused_for_hint: {
    HINT_RECEIVED: "ready",
    END_PRACTICE: "ending",
    ERROR: "error",
  },
  ending: {
    EVALUATION_STARTED: "evaluating",
    ERROR: "error",
  },
  evaluating: {
    EVALUATION_COMPLETE: "complete",
    ERROR: "error",
  },
  complete: {},
  error: {
    RETRY: "ready",
  },
};

/** Pure reducer. Unknown/illegal (state, event) pairs return the same state unchanged. */
export function transition(state: SimulationState, event: SimulationEvent): SimulationState {
  return TRANSITIONS[state]?.[event.type] ?? state;
}
