/**
 * A second production test confirmed the first-turn 500ms confirmation window alone was still not
 * enough: a startup echo event persisted long enough to survive it and get confirmed as a false
 * barge-in (observed timeline: AI speaking ~1.5-2.0s, false "Listening" ~2.5s, "Thinking" ~3.5s,
 * AI resumes ~4.0s — the false speech_started must have started at or near when AI audio itself
 * began, i.e. right when the browser's echo-cancellation filter has had zero time to adapt).
 *
 * A flat larger confirmMs for the whole first turn would fix this but also slow down a genuine
 * interruption anywhere in that turn, not just at its start. Instead: a short one-time GRACE
 * PERIOD anchored to when AI audio actually starts playing (not before — there's nothing for echo
 * cancellation to adapt against before that), during which the effective confirmation requirement
 * is grace-time-remaining + the normal first-turn follow-up window. As real time passes since
 * audio started, the required duration shrinks smoothly toward just the follow-up window, and once
 * the grace period has fully elapsed, it collapses to exactly STARTUP_FOLLOWUP_CONFIRM_MS — no
 * separate "in grace / not in grace" branch or hard cliff, just one continuous formula.
 */

/** How long after AI audio starts playing extra protection applies. Anchored to actual playback start. */
export const STARTUP_GRACE_MS = 1000;

/** The confirmation window that still applies once the grace period has elapsed, for the rest of the first turn. */
export const STARTUP_FOLLOWUP_CONFIRM_MS = 500;

/**
 * How long speech must persist, from right now, to count as genuine barge-in — given how much
 * time has already passed since the AI's first audio started playing. `null` (audio start not yet
 * known, e.g. speech_started arrived in the brief gap before output_audio_buffer.started) is
 * treated as "no time has passed yet," the most conservative/protective case.
 */
export function computeStartupConfirmMs(
  elapsedSinceFirstAiAudioMs: number | null,
  graceMs: number = STARTUP_GRACE_MS,
  followUpConfirmMs: number = STARTUP_FOLLOWUP_CONFIRM_MS,
): number {
  const elapsed = elapsedSinceFirstAiAudioMs ?? 0;
  const remainingGrace = Math.max(0, graceMs - elapsed);
  return remainingGrace + followUpConfirmMs;
}
