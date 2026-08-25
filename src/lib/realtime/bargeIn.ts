/**
 * Client-side barge-in confirmation. Production evidence (no headphones: false interruptions
 * several times per conversation; headphones: zero) points at acoustic echo — the AI's own
 * speaker output leaking into the microphone and registering as a `speech_started` VAD event.
 *
 * The OpenAI Realtime `server_vad` turn detector's `interrupt_response: true` cancels the active
 * AI response the INSTANT a single `speech_started` event arrives — server-side, unconditionally,
 * with no minimum-duration check and no way for the client to veto it (see the SDK's own doc
 * comment on `interrupt_response`). That is fragile by construction: even with good echo
 * cancellation and a higher VAD threshold, a click, breath, or brief noise can still produce one
 * VAD start event. So `interrupt_response` is set to `false` (see session.ts) and this module
 * takes over that decision: an AI-speech interruption only actually happens once speech has
 * persisted for a short, fixed confirmation window — short enough that genuine barge-in still
 * feels immediate, long enough that a sub-window blip never touches the AI's response at all.
 *
 * When the AI is NOT speaking, there is nothing to protect against echo of (nothing playing to
 * leak back), so ordinary turn-taking is reported immediately with no delay.
 *
 * `handleAiSpeakingChanged(true)` should be called as soon as a response is known to be starting
 * (OpenAI's `response.created`, which precedes any audio), not only once audio actually begins
 * (`output_audio_buffer.started`) — the two are not guaranteed to be processed in the same order
 * a client receives them (media flows over SRTP, events over the data channel), and a gap where
 * this controller still believes the AI isn't speaking yet would let an echo-triggered
 * `speech_started` through with zero confirmation delay. This matters most for the very first AI
 * turn: it is also the turn where the browser's echo-cancellation adaptive filter has had the
 * least time to converge against the newly-started output, so it's the turn most likely to
 * produce a stray VAD trigger in the first place. See realtime-simulation-client.tsx for the
 * startup-specific widened confirmation window this enables.
 */

export const DEFAULT_BARGE_IN_CONFIRM_MS = 250;

export interface BargeInControllerOptions {
  /**
   * How long speech must persist while the AI is speaking before it's treated as genuine
   * barge-in. A function is evaluated fresh on every speech_started, so a caller can widen the
   * window for a specific known-riskier window (e.g. the first AI turn, before the browser's
   * echo-cancellation adaptive filter has converged against the newly-started output) without
   * changing the value used everywhere else in the conversation.
   */
  confirmMs?: number | (() => number);
  /** AI was not speaking — this is ordinary turn-taking, report speech-started immediately. */
  onImmediateSpeechStart: () => void;
  /** Speech persisted through the confirmation window while the AI was speaking — genuine barge-in. */
  onConfirmedBargeIn: () => void;
  /** speech_stopped for a segment that was reported (immediate or confirmed) — normal end-of-turn. */
  onSpeechStoppedAfterReport: () => void;
  /** Injectable timer, real setTimeout/clearTimeout by default — overridable for deterministic tests. */
  setTimer?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (id: ReturnType<typeof setTimeout>) => void;
}

export interface BargeInController {
  /** Call when the AI's audio output starts or stops (output_audio_buffer.started/stopped). */
  handleAiSpeakingChanged(isSpeaking: boolean): void;
  /** Call on input_audio_buffer.speech_started. */
  handleSpeechStarted(): void;
  /** Call on input_audio_buffer.speech_stopped. */
  handleSpeechStopped(): void;
  /** True while a speech segment is being confirmed (not yet reported, not yet resolved). */
  isPending(): boolean;
  /** Clears all internal state — use on reconnect. */
  reset(): void;
}

export function createBargeInController(options: BargeInControllerOptions): BargeInController {
  const confirmMsOption = options.confirmMs ?? DEFAULT_BARGE_IN_CONFIRM_MS;
  const resolveConfirmMs = () => (typeof confirmMsOption === "function" ? confirmMsOption() : confirmMsOption);
  const setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = options.clearTimer ?? ((id) => clearTimeout(id));

  let aiSpeaking = false;
  let pendingTimer: ReturnType<typeof setTimeout> | null = null;
  /** Whether onImmediateSpeechStart/onConfirmedBargeIn has fired for the CURRENT speech segment. */
  let reported = false;

  function clearPendingTimer() {
    if (pendingTimer !== null) {
      clearTimer(pendingTimer);
      pendingTimer = null;
    }
  }

  return {
    handleAiSpeakingChanged(isSpeaking) {
      const wasSpeaking = aiSpeaking;
      aiSpeaking = isSpeaking;
      if (wasSpeaking && !isSpeaking && pendingTimer !== null) {
        // The AI finished on its own while we were still waiting to confirm — there is no longer
        // an active response to protect, so this is just an ordinary turn starting now.
        clearPendingTimer();
        if (!reported) {
          reported = true;
          options.onImmediateSpeechStart();
        }
      }
    },

    handleSpeechStarted() {
      clearPendingTimer();
      reported = false;

      if (!aiSpeaking) {
        reported = true;
        options.onImmediateSpeechStart();
        return;
      }

      pendingTimer = setTimer(() => {
        pendingTimer = null;
        reported = true;
        options.onConfirmedBargeIn();
      }, resolveConfirmMs());
    },

    handleSpeechStopped() {
      if (pendingTimer !== null) {
        // Speech ended before the confirmation window elapsed — a click, breath, or echo blip.
        // Nothing was ever reported or cancelled, so there is nothing to undo.
        clearPendingTimer();
        return;
      }
      if (reported) {
        reported = false;
        options.onSpeechStoppedAfterReport();
      }
    },

    isPending() {
      return pendingTimer !== null;
    },

    reset() {
      clearPendingTimer();
      aiSpeaking = false;
      reported = false;
    },
  };
}
