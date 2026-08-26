/**
 * Runs `fn`, catching and reporting any thrown error rather than letting it propagate. Used to
 * isolate Phase 4A speech-delivery evidence calls (speechDeliveryTracker.ts's openTurn/closeTurn/
 * pushEnergySample) from the Realtime lifecycle event handlers that call them alongside critical
 * logic (sessionTimeline recording, the barge-in controller, UI state dispatch) — see
 * /docs/DECISIONS.md "Response-stall incident", Part C. Analytics must never be able to block or
 * break Realtime response processing; extracting this into one small, directly-testable function
 * (rather than an inline try/catch repeated at each call site) makes that guarantee itself a unit
 * test, not just an inline pattern trusted by inspection.
 */
export function safeCall(fn: () => void, onError: (error: unknown) => void): void {
  try {
    fn();
  } catch (error) {
    onError(error);
  }
}
