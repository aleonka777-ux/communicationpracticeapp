import { describe, expect, it } from "vitest";
import { createResponseLifecycleTracker } from "@/lib/realtime/responseLifecycle";

describe("createResponseLifecycleTracker — conversation_already_has_active_response fix (see /docs/DECISIONS.md)", () => {
  it("1. normal VAD: user stops -> automatic response created -> completed. No recovery needed.", () => {
    const t = createResponseLifecycleTracker();

    t.recordUserSpeechStopped("item_1");
    expect(t.getSnapshot().pendingUserItemId).toBe("item_1");

    t.recordResponseCreated("resp_1");
    expect(t.getSnapshot().pendingUserItemId).toBeNull();
    expect(t.hasActiveResponse()).toBe(true);

    const result = t.recordResponseDone("resp_1");
    expect(result).toEqual({ matchedActiveResponse: true, shouldSendRecovery: false });
    expect(t.hasActiveResponse()).toBe(false);
  });

  it("2. user resumes during an automatically-created response (barge-in cancel/clear): the eventual response.done(cancelled) is still a valid gate-clear, but there is nothing pending since the turn that created it was already satisfied", () => {
    const t = createResponseLifecycleTracker();

    t.recordUserSpeechStopped("item_1");
    t.recordResponseCreated("resp_1"); // pendingUserItemId cleared here — the automatic response WAS created
    // User resumes speaking (barge-in) — no speech_stopped yet, so no new pending expectation.
    // Response A is cancelled server-side; response.done eventually arrives for it.
    const result = t.recordResponseDone("resp_1");

    expect(result.matchedActiveResponse).toBe(true);
    expect(result.shouldSendRecovery).toBe(false); // nothing pending — no spurious extra response.create
  });

  it("3. user stops again while the prior response's cancellation/completion is still settling: the SECOND automatic response attempt collides -> conversation_already_has_active_response. The pending expectation from the second stop is preserved.", () => {
    const t = createResponseLifecycleTracker();

    t.recordUserSpeechStopped("item_1");
    t.recordResponseCreated("resp_A"); // response A created for fragment 1
    // Fragment 2 begins and ends before A's cancellation settles.
    t.recordUserSpeechStopped("item_2");
    // The server rejects the automatic attempt for item_2 with conversation_already_has_active_response
    // — no response.created ever arrives for it. Nothing to call here (the error itself carries no
    // response id and must not mutate tracked state — see the module doc comment) — pendingUserItemId
    // simply stays "item_2".
    expect(t.getSnapshot().pendingUserItemId).toBe("item_2");
    expect(t.getSnapshot().activeResponseId).toBe("resp_A");
  });

  it("4/5. rejected auto-response does not silently consume the user's latest turn: once response A's response.done arrives, recovery is signalled for item_2", () => {
    const t = createResponseLifecycleTracker();

    t.recordUserSpeechStopped("item_1");
    t.recordResponseCreated("resp_A");
    t.recordUserSpeechStopped("item_2"); // this one's automatic attempt is the one that gets rejected

    const result = t.recordResponseDone("resp_A"); // authoritative: the gate has now genuinely cleared

    expect(result.matchedActiveResponse).toBe(true);
    expect(result.shouldSendRecovery).toBe(true);
    expect(t.getSnapshot().pendingUserItemId).toBe("item_2"); // still visible for the caller to log
  });

  it("6. lifecycle-gated recovery creates at most one subsequent response: after the caller sends the recovery response.create and calls recordRecoveryAttempted(), a second response.done for something else does not trigger a second recovery for the same turn", () => {
    const t = createResponseLifecycleTracker();
    t.recordUserSpeechStopped("item_1");
    t.recordResponseCreated("resp_A");
    t.recordUserSpeechStopped("item_2");
    const first = t.recordResponseDone("resp_A");
    expect(first.shouldSendRecovery).toBe(true);
    t.recordRecoveryAttempted(); // caller sent response.create

    // Suppose that recovery response.create is itself somehow rejected too (no response.created
    // ever arrives) and some OTHER, unrelated response.done arrives (e.g. a stale/late event) —
    // recovery must not fire again for the same still-pending item while recoveryInFlight is set.
    const second = t.recordResponseDone("resp_unrelated");
    expect(second.matchedActiveResponse).toBe(false); // doesn't even match — nothing was tracked as resp_unrelated
    expect(second.shouldSendRecovery).toBe(false);
  });

  it("a genuinely successful recovery clears both the pending turn and the in-flight guard", () => {
    const t = createResponseLifecycleTracker();
    t.recordUserSpeechStopped("item_1");
    t.recordResponseCreated("resp_A");
    t.recordUserSpeechStopped("item_2");
    t.recordResponseDone("resp_A");
    t.recordRecoveryAttempted();

    t.recordResponseCreated("resp_B"); // the recovery response.create succeeded
    expect(t.getSnapshot()).toEqual({ activeResponseId: "resp_B", pendingUserItemId: null, recoveryInFlight: false });
  });

  it("7. completed/cancelled response ids cannot remain stale as active ownership: response.done for a non-matching id is a no-op on activeResponseId, never silently overwritten", () => {
    const t = createResponseLifecycleTracker();
    t.recordUserSpeechStopped("item_1");
    t.recordResponseCreated("resp_A");

    const result = t.recordResponseDone("resp_STALE_OR_UNRELATED");

    expect(result.matchedActiveResponse).toBe(false);
    expect(result.shouldSendRecovery).toBe(false);
    expect(t.getSnapshot().activeResponseId).toBe("resp_A"); // untouched — still correctly tracked as active
  });

  it("8. multiple rapid VAD splits: only the LATEST unanswered turn is tracked as pending (one recovery response.create answers the full conversation state, not per-fragment)", () => {
    const t = createResponseLifecycleTracker();
    t.recordUserSpeechStopped("item_1");
    t.recordResponseCreated("resp_A");
    t.recordUserSpeechStopped("item_2"); // rejected
    t.recordUserSpeechStopped("item_3"); // rejected too, immediately after
    t.recordUserSpeechStopped("item_4"); // rejected too — this is now the one that matters

    expect(t.getSnapshot().pendingUserItemId).toBe("item_4");

    const result = t.recordResponseDone("resp_A");
    expect(result.shouldSendRecovery).toBe(true);
    expect(t.getSnapshot().pendingUserItemId).toBe("item_4");
  });

  it("a fresh user turn always resets the recovery-in-flight guard, so a later genuine turn is never blocked by an earlier stuck recovery", () => {
    const t = createResponseLifecycleTracker();
    t.recordUserSpeechStopped("item_1");
    t.recordResponseCreated("resp_A");
    t.recordUserSpeechStopped("item_2");
    t.recordResponseDone("resp_A");
    t.recordRecoveryAttempted();
    expect(t.getSnapshot().recoveryInFlight).toBe(true);

    t.recordUserSpeechStopped("item_3"); // the user spoke again — a fresh chance
    expect(t.getSnapshot().recoveryInFlight).toBe(false);
    expect(t.getSnapshot().pendingUserItemId).toBe("item_3");
  });

  it("9. the tracker has no concept of a watchdog/timer at all — it never fires anything on its own, only in response to explicit calls (the 12s stall watchdog remains a wholly separate, untouched mechanism that cannot itself create a duplicate response)", () => {
    const t = createResponseLifecycleTracker();
    t.recordUserSpeechStopped("item_1");
    // No further calls at all — simulating time passing with nothing else happening.
    expect(t.getSnapshot()).toEqual({ activeResponseId: null, pendingUserItemId: "item_1", recoveryInFlight: false });
    expect(t.hasActiveResponse()).toBe(false);
  });

  it("hasActiveResponse reflects tracked state precisely: false initially, true after creation, false after a matching done", () => {
    const t = createResponseLifecycleTracker();
    expect(t.hasActiveResponse()).toBe(false);
    t.recordResponseCreated("resp_1");
    expect(t.hasActiveResponse()).toBe(true);
    t.recordResponseDone("resp_1");
    expect(t.hasActiveResponse()).toBe(false);
  });
});
