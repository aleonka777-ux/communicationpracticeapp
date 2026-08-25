import type { RealtimeConnectionState } from "@/lib/realtime/connectionState";

const IN_PROGRESS_STATES: ReadonlySet<RealtimeConnectionState> = new Set([
  "user_speaking",
  "thinking",
  "speaking",
]);

/**
 * Bounded wait used only for ordinary timer expiry (never for a manual End Practice, which stops
 * immediately). At 0:00 the current conversational exchange should finish naturally rather than
 * being cut off mid-word: if the user is still speaking, let them finish; if that causes an AI
 * response, let it finish too. "Exchange finished" means the connection state has returned to
 * `listening` (nobody currently has the floor) AND the user's last utterance has actually finished
 * transcribing. Capped by `timeoutMs` as a safety valve — a stuck exchange can never block ending
 * indefinitely, at the cost of a rare late cutoff in that one edge case.
 */
export async function waitForCurrentExchangeToFinish(
  stateRef: { current: RealtimeConnectionState },
  pendingUserTranscriptionRef: { current: boolean },
  timeoutMs = 20000,
  pollMs = 150,
): Promise<void> {
  const start = Date.now();
  while (
    (IN_PROGRESS_STATES.has(stateRef.current) || pendingUserTranscriptionRef.current) &&
    Date.now() - start < timeoutMs
  ) {
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}
