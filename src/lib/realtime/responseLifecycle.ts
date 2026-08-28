/**
 * Tracks the OpenAI Realtime "at most one active response" invariant explicitly, and provides a
 * lifecycle-GATED recovery path for the `conversation_already_has_active_response` incident (see
 * /docs/DECISIONS.md "conversation_already_has_active_response lifecycle fix").
 *
 * The bug, reconstructed from production evidence and code, not assumed:
 *
 * This app never sends an explicit `response.create` for ordinary voice turn-taking —
 * `turn_detection.create_response: true` (session.ts) means the SERVER automatically attempts to
 * create a response the instant it decides `input_audio_buffer.speech_stopped`. Before this module,
 * the client tracked NOTHING about that automatic attempt: no ref recorded which response id (if
 * any) was currently active, and the generic `case "error":` handler in
 * realtime-simulation-client.tsx only logged `conversation_already_has_active_response` to the
 * console — it never changed any state.
 *
 * The user frequently speaks in tightly-spaced fragments (a deliberate mid-thought pause splits one
 * utterance into several server-VAD turns — see /docs/DECISIONS.md's other entries on mechanical
 * segmentation). Each fragment's `speech_stopped` makes the server attempt an automatic
 * response.create. If the user resumes speaking (the next fragment) while the PRIOR fragment's
 * auto-created response is still active/being cancelled (a confirmed barge-in sends `response.cancel`
 * + `output_audio_buffer.clear`, but cancellation is not instantaneous — the server needs to reach a
 * terminal lifecycle state before a NEW response can be created), the server can be in a state where
 * it is still finalizing response A at the exact moment it tries to auto-create response B for the
 * fragment that just ended. That collision is `conversation_already_has_active_response`.
 *
 * Once that automatic attempt is rejected, `response.created` for it NEVER arrives — there is no
 * failed-response event to react to, no `response.done` for something that was never created. If the
 * client was showing "Thinking" (waiting for a reply) at that moment, NOTHING in the prior code would
 * ever clear it: `response.done` only ever fires for a response that was actually created, and no
 * other event marks "this turn's automatic response attempt failed." The user's turn is silently
 * lost until either the 12-second stall watchdog reveals a manual escape hatch, or the user speaks
 * again (which is exactly what production's `unanswered_user_turn_count`/`longest_unanswered_stall_ms`
 * evidence shows).
 *
 * The fix is NOT a blind retry. `conversation_already_has_active_response` itself proves the server
 * believes a response is active — sending another `response.create` immediately risks hitting the
 * exact same error again, or a duplicate response if the "stuck" one turns out to actually be fine.
 * Recovery must be GATED on authoritative evidence that the "at most one active response" slot has
 * genuinely cleared: `response.done` for whichever response THIS tracker believes is active. Once
 * that fires, IF a user turn's automatic response was never satisfied (no `response.created` seen
 * since that turn's `speech_stopped`), it is now safe — proven safe, not guessed — to send exactly
 * one recovery `response.create`. Because a Realtime `response.create` always reflects the FULL
 * current conversation history (not a specific turn), one recovery response correctly answers
 * whatever the user said, including any further fragments spoken in the interim; there is no need,
 * and no reliable way given this API, to correlate a specific triggering item id to the response that
 * eventually answers it.
 *
 * Invariant this module maintains (see the class-level doc comment on each method for how):
 *   at most one activeResponseId is ever tracked as active at a time, and
 *   every user turn that "expects" a response (recordUserSpeechStopped) either has that expectation
 *   satisfied (recordResponseCreated) or is retried exactly once when the active-response gate next
 *   provably clears (recordResponseDone's shouldSendRecovery), never silently dropped.
 */

export interface ResponseLifecycleSnapshot {
  /** The most recently created response's id, until its own response.done clears it. Null if
   *  nothing is currently believed to be active. */
  activeResponseId: string | null;
  /** The item id (or a synthetic marker, e.g. for the text fallback) of the most recent user turn
   *  whose automatic/expected response has not yet been confirmed via response.created. Null if
   *  every turn spoken so far has had a response created for it. */
  pendingUserItemId: string | null;
  /** True from the moment a recovery response.create is sent until either response.created
   *  confirms it worked or the user speaks again (a fresh turn resets this) — prevents a tight
   *  retry loop if the recovery attempt itself is somehow rejected. */
  recoveryInFlight: boolean;
}

export interface ResponseDoneResult {
  /** False when the response.done id did not match what this tracker believed was active — a
   *  genuine anomaly worth logging loudly, never silently corrected by assuming the new id. When
   *  false, activeResponseId is left untouched and shouldSendRecovery is always false (acting on
   *  uncertain information is exactly the "blind retry" this module exists to avoid). */
  matchedActiveResponse: boolean;
  /** True iff the active-response gate has just (provably) cleared AND a user turn is still
   *  awaiting a response AND no recovery is already in flight for it. The caller should send
   *  EXACTLY ONE response.create when this is true, then call recordRecoveryAttempted(). */
  shouldSendRecovery: boolean;
}

export interface ResponseLifecycleTracker {
  /** Call on input_audio_buffer.speech_stopped (or, for the text-input fallback, right before
   *  attempting to send a message) — marks this item as the latest one whose response is expected.
   *  Also clears recoveryInFlight: a fresh turn is always a fresh chance to recover. */
  recordUserSpeechStopped(itemId: string): void;
  /** Call on response.created. A response now genuinely exists, so whatever was pending is
   *  considered satisfied (see the module doc comment on why item-level correlation isn't needed or
   *  reliable with this API) — clears pendingUserItemId and recoveryInFlight, sets activeResponseId. */
  recordResponseCreated(responseId: string): void;
  /** Call on response.done. See ResponseDoneResult. */
  recordResponseDone(responseId: string): ResponseDoneResult;
  /** Call immediately after sending a recovery response.create (i.e. whenever recordResponseDone
   *  returned shouldSendRecovery: true and the caller acted on it). */
  recordRecoveryAttempted(): void;
  /** True iff a response is currently believed active — use to gate any OTHER manual
   *  response.create call site (e.g. the text-input fallback) against the same collision. */
  hasActiveResponse(): boolean;
  /** Diagnostic snapshot only — see the module doc comment's instrumentation section. Never used to
   *  drive behavior beyond what the methods above already expose. */
  getSnapshot(): ResponseLifecycleSnapshot;
}

export function createResponseLifecycleTracker(): ResponseLifecycleTracker {
  let activeResponseId: string | null = null;
  let pendingUserItemId: string | null = null;
  let recoveryInFlight = false;

  return {
    recordUserSpeechStopped(itemId) {
      pendingUserItemId = itemId;
      recoveryInFlight = false;
    },

    recordResponseCreated(responseId) {
      activeResponseId = responseId;
      pendingUserItemId = null;
      recoveryInFlight = false;
    },

    recordResponseDone(responseId) {
      if (activeResponseId !== responseId) {
        return { matchedActiveResponse: false, shouldSendRecovery: false };
      }
      activeResponseId = null;
      const shouldSendRecovery = pendingUserItemId !== null && !recoveryInFlight;
      return { matchedActiveResponse: true, shouldSendRecovery };
    },

    recordRecoveryAttempted() {
      recoveryInFlight = true;
    },

    hasActiveResponse() {
      return activeResponseId !== null;
    },

    getSnapshot() {
      return { activeResponseId, pendingUserItemId, recoveryInFlight };
    },
  };
}
