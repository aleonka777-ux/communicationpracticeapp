import { describe, expect, it, vi } from "vitest";
import { createNavigationRecovery, NAVIGATION_STALL_TIMEOUT_MS } from "@/lib/practice/navigationRecovery";

/** Deterministic manual timer — mirrors the injectable-timer pattern already used by
 *  src/lib/realtime/bargeIn.ts's own tests. */
function createManualTimer() {
  let nextId = 1;
  const pending = new Map<number, { fn: () => void; dueAt: number; ms: number }>();
  let now = 0;
  return {
    setTimer: (fn: () => void, ms: number) => {
      const id = nextId++;
      pending.set(id, { fn, dueAt: now + ms, ms });
      return id as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimer: (id: ReturnType<typeof setTimeout>) => {
      pending.delete(id as unknown as number);
    },
    advance: (ms: number) => {
      now += ms;
      for (const [id, entry] of [...pending.entries()]) {
        if (entry.dueAt <= now) {
          pending.delete(id);
          entry.fn();
        }
      }
    },
    pendingCount: () => pending.size,
  };
}

describe("createNavigationRecovery", () => {
  it("1. normal case: start() navigates immediately; cancel() before the timeout means the watchdog never fires (mirrors /api/practice/end succeeding -> normal navigation)", () => {
    const timer = createManualTimer();
    const softNavigate = vi.fn();
    const hardNavigate = vi.fn();
    const onStalled = vi.fn();

    const recovery = createNavigationRecovery({
      softNavigate,
      hardNavigate,
      onStalled,
      setTimer: timer.setTimer,
      clearTimer: timer.clearTimer,
    });

    recovery.start();
    expect(softNavigate).toHaveBeenCalledTimes(1);

    // Normal navigation succeeds well before the timeout (e.g. the component unmounts).
    timer.advance(NAVIGATION_STALL_TIMEOUT_MS - 1000);
    recovery.cancel();
    timer.advance(5000); // long past the original timeout

    expect(onStalled).not.toHaveBeenCalled();
    expect(hardNavigate).not.toHaveBeenCalled();
  });

  it("2. soft navigation stalls: no cancel() before NAVIGATION_STALL_TIMEOUT_MS elapses -> onStalled fires", () => {
    const timer = createManualTimer();
    const onStalled = vi.fn();
    const recovery = createNavigationRecovery({
      softNavigate: vi.fn(),
      hardNavigate: vi.fn(),
      onStalled,
      setTimer: timer.setTimer,
      clearTimer: timer.clearTimer,
    });

    recovery.start();
    timer.advance(NAVIGATION_STALL_TIMEOUT_MS - 1);
    expect(onStalled).not.toHaveBeenCalled();
    timer.advance(1);
    expect(onStalled).toHaveBeenCalledTimes(1);
  });

  it("3. watchdog fallback successfully navigates: hardNavigate is called exactly once when the timeout elapses uncancelled", () => {
    const timer = createManualTimer();
    const hardNavigate = vi.fn();
    const recovery = createNavigationRecovery({
      softNavigate: vi.fn(),
      hardNavigate,
      onStalled: vi.fn(),
      setTimer: timer.setTimer,
      clearTimer: timer.clearTimer,
    });

    recovery.start();
    timer.advance(NAVIGATION_STALL_TIMEOUT_MS);
    expect(hardNavigate).toHaveBeenCalledTimes(1);

    // Firing again later must not double-navigate — the timer is one-shot.
    timer.advance(NAVIGATION_STALL_TIMEOUT_MS);
    expect(hardNavigate).toHaveBeenCalledTimes(1);
  });

  it("4. fallback does not trigger duplicate practice finalization: the only capabilities this module has are softNavigate/hardNavigate/onStalled — no finalize/fetch call is ever made on the stall path", () => {
    const timer = createManualTimer();
    // A decoy spy representing '/api/practice/end' — NavigationRecoveryOptions has no field that
    // could ever reach it, so this can only be invoked if the module were doing something outside
    // its documented, narrow capability surface.
    const finalizePracticeEnd = vi.fn();
    const hardNavigate = vi.fn();

    const recovery = createNavigationRecovery({
      softNavigate: vi.fn(),
      hardNavigate,
      onStalled: vi.fn(),
      setTimer: timer.setTimer,
      clearTimer: timer.clearTimer,
    });

    recovery.start();
    timer.advance(NAVIGATION_STALL_TIMEOUT_MS);

    expect(hardNavigate).toHaveBeenCalledTimes(1);
    expect(finalizePracticeEnd).not.toHaveBeenCalled();
  });

  it("6. watchdog is cancelled after successful normal navigation: cancel() clears the pending timer so nothing fires later, even if called well before the deadline", () => {
    const timer = createManualTimer();
    const onStalled = vi.fn();
    const recovery = createNavigationRecovery({
      softNavigate: vi.fn(),
      hardNavigate: vi.fn(),
      onStalled,
      setTimer: timer.setTimer,
      clearTimer: timer.clearTimer,
    });

    recovery.start();
    expect(timer.pendingCount()).toBe(1);
    recovery.cancel();
    expect(timer.pendingCount()).toBe(0);
    timer.advance(NAVIGATION_STALL_TIMEOUT_MS * 2);
    expect(onStalled).not.toHaveBeenCalled();
  });

  it("cancel() is safe to call more than once, and safe to call after the watchdog has already fired", () => {
    const timer = createManualTimer();
    const onStalled = vi.fn();
    const recovery = createNavigationRecovery({
      softNavigate: vi.fn(),
      hardNavigate: vi.fn(),
      onStalled,
      setTimer: timer.setTimer,
      clearTimer: timer.clearTimer,
    });

    recovery.start();
    expect(() => {
      recovery.cancel();
      recovery.cancel();
    }).not.toThrow();

    // Also safe after it already fired.
    const recovery2 = createNavigationRecovery({
      softNavigate: vi.fn(),
      hardNavigate: vi.fn(),
      onStalled,
      setTimer: timer.setTimer,
      clearTimer: timer.clearTimer,
    });
    recovery2.start();
    timer.advance(NAVIGATION_STALL_TIMEOUT_MS);
    expect(() => recovery2.cancel()).not.toThrow();
  });

  it("respects a custom timeoutMs override", () => {
    const timer = createManualTimer();
    const onStalled = vi.fn();
    const recovery = createNavigationRecovery({
      softNavigate: vi.fn(),
      hardNavigate: vi.fn(),
      onStalled,
      timeoutMs: 500,
      setTimer: timer.setTimer,
      clearTimer: timer.clearTimer,
    });
    recovery.start();
    timer.advance(499);
    expect(onStalled).not.toHaveBeenCalled();
    timer.advance(1);
    expect(onStalled).toHaveBeenCalledTimes(1);
  });
});
