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
  /**
   * `USER_STOPPED_SPEAKING` only: whether AI audio is confirmed to be actually, audibly playing
   * (i.e. `output_audio_buffer.started` has fired and neither `.stopped` nor `.cleared` has fired
   * since) at the instant the user's speech stopped. Real concurrent evidence, not a guess or a
   * timer — see the "user_speaking" transition rule below and /docs/DECISIONS.md "State-machine
   * race: Thinking shown during audible AI playback" for the production incident this fixes.
   */
  aiSpeaking?: boolean;
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
    // Default: no AI turn is in flight, so once the user stops, we're genuinely waiting on the AI
    // — see the conditional override in transitionRealtimeConnection() below for when this is
    // wrong (AI audio is already, actually playing).
    USER_STOPPED_SPEAKING: "thinking",
    // The AI can genuinely start producing audio WHILE the user is still mid-utterance (e.g. one
    // real utterance split by server VAD into two segments, with the AI's reply to the first
    // segment beginning during the brief gap before the second segment's own speech_started
    // fires — the exact production shape behind the incident above). Reflecting this immediately,
    // rather than waiting for the user's OWN turn to end, keeps the UI accurate in real time.
    AI_STARTED_SPEAKING: "speaking",
    END_PRACTICE: "ending",
    TIME_UP: "ending",
    ERROR: "error",
  },
  thinking: {
    AI_STARTED_SPEAKING: "speaking",
    USER_STARTED_SPEAKING: "user_speaking",
    // Lifecycle-proven recovery for the response-stall incident (see /docs/DECISIONS.md
    // "Response-stall incident", Part B/G): the client dispatches this specifically when a
    // response.done arrives for the response we were waiting on and its status is anything other
    // than "completed" (failed/cancelled/incomplete) — proof that THIS specific response will never
    // produce audio, not a guess. Falls back to "listening" (not "speaking", since no audio ever
    // played) rather than leaving the UI stuck showing "Thinking" indefinitely. This is distinct
    // from a retry: no new response.create is sent, only the UI label is corrected to match a
    // proven fact.
    AI_FINISHED_SPEAKING: "listening",
    END_PRACTICE: "ending",
    TIME_UP: "ending",
    ERROR: "error",
  },
  speaking: {
    // A user barge-in is expected and allowed (server_vad's interrupt_response) — the UI just
    // reflects that the floor changed, it doesn't need special "interruption" handling here.
    USER_STARTED_SPEAKING: "user_speaking",
    // USER_STOPPED_SPEAKING intentionally has NO entry here: if the user's speech ends while the
    // AI is already confirmed "speaking", staying "speaking" (via the `?? state` fallback below)
    // is exactly correct — the AI is still genuinely, audibly talking, so there is nothing to
    // "think" about yet. See the module doc comment.
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

/**
 * Pure reducer. Unknown/illegal (state, event) pairs return the same state unchanged.
 *
 * One deliberate exception to the static table above: `USER_STOPPED_SPEAKING` while `state` is
 * `"user_speaking"` normally goes to `"thinking"` (the default, common case — no AI turn is in
 * flight). But if the caller supplies real concurrent evidence that AI audio is ALREADY, actually
 * playing at that exact instant (`event.aiSpeaking === true` — see the field's own doc comment),
 * this resolves to `"speaking"` instead. This covers the case the static table's new
 * `user_speaking: { AI_STARTED_SPEAKING: "speaking" }` entry does NOT: the AI was already speaking
 * BEFORE the user's current turn began (a genuine overlap/near-barge-in), so no fresh
 * `AI_STARTED_SPEAKING` event ever arrives while in `"user_speaking"` to trigger that table entry.
 * Deliberately resolved from an actual fact supplied at dispatch time, not a timeout or a guess —
 * see /docs/DECISIONS.md "State-machine race: Thinking shown during audible AI playback".
 */
export function transitionRealtimeConnection(
  state: RealtimeConnectionState,
  event: RealtimeConnectionEvent,
): RealtimeConnectionState {
  if (event.type === "USER_STOPPED_SPEAKING" && state === "user_speaking" && event.aiSpeaking) {
    return "speaking";
  }
  return TRANSITIONS[state]?.[event.type] ?? state;
}
