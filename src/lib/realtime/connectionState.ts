/**
 * Explicit state machine for the Realtime voice UI — deliberately separate from
 * src/lib/simulation/stateMachine.ts (the batch STT/LLM/TTS flow), which stays untouched as the
 * fallback/rollback path (see /docs/DECISIONS.md "Realtime voice rollout"). Realtime is
 * continuously listening rather than start/stop-recording per turn, so its states are simpler:
 * no `recording`/`transcribing` — just who currently has the floor.
 */

export type RealtimeConnectionState =
  | "connecting"
  | "listening"
  | "user_speaking"
  | "thinking"
  | "speaking"
  | "ending"
  | "evaluating"
  | "complete"
  | "error";

export type RealtimeConnectionEventType =
  | "CONNECTED"
  | "USER_STARTED_SPEAKING"
  | "USER_STOPPED_SPEAKING"
  | "AI_STARTED_SPEAKING"
  | "AI_FINISHED_SPEAKING"
  | "END_PRACTICE"
  | "TIME_UP"
  | "EVALUATION_STARTED"
  | "EVALUATION_COMPLETE"
  | "ERROR"
  | "RETRY";

export interface RealtimeConnectionEvent {
  type: RealtimeConnectionEventType;
}

type TransitionTable = Record<RealtimeConnectionState, Partial<Record<RealtimeConnectionEventType, RealtimeConnectionState>>>;

const TRANSITIONS: TransitionTable = {
  connecting: {
    CONNECTED: "listening",
    END_PRACTICE: "ending",
    TIME_UP: "ending",
    ERROR: "error",
  },
  listening: {
    USER_STARTED_SPEAKING: "user_speaking",
    AI_STARTED_SPEAKING: "speaking",
    END_PRACTICE: "ending",
    TIME_UP: "ending",
    ERROR: "error",
  },
  user_speaking: {
    USER_STOPPED_SPEAKING: "thinking",
    END_PRACTICE: "ending",
    TIME_UP: "ending",
    ERROR: "error",
  },
  thinking: {
    AI_STARTED_SPEAKING: "speaking",
    USER_STARTED_SPEAKING: "user_speaking",
    END_PRACTICE: "ending",
    TIME_UP: "ending",
    ERROR: "error",
  },
  speaking: {
    // A user barge-in is expected and allowed (server_vad's interrupt_response) — the UI just
    // reflects that the floor changed, it doesn't need special "interruption" handling here.
    USER_STARTED_SPEAKING: "user_speaking",
    AI_FINISHED_SPEAKING: "listening",
    END_PRACTICE: "ending",
    TIME_UP: "ending",
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
    RETRY: "connecting",
  },
};

/** Pure reducer. Unknown/illegal (state, event) pairs return the same state unchanged. */
export function transitionRealtimeConnection(
  state: RealtimeConnectionState,
  event: RealtimeConnectionEvent,
): RealtimeConnectionState {
  return TRANSITIONS[state]?.[event.type] ?? state;
}
