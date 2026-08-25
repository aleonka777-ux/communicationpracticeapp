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
 */

export const DEFAULT_BARGE_IN_CONFIRM_MS = 250;

export interface BargeInControllerOptions {
  /** How long speech must persist while the AI is speaking before it's treated as genuine barge-in. */
  confirmMs?: number;
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
  const confirmMs = options.confirmMs ?? DEFAULT_BARGE_IN_CONFIRM_MS;
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
      }, confirmMs);
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
