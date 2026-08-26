import { describe, expect, it, vi } from "vitest";
import { safeCall } from "@/lib/realtime/safeCall";

/**
 * Regression coverage for the response-stall incident's Part C (see /docs/DECISIONS.md) — Phase 4A
 * speech-delivery calls (openTurn/closeTurn/pushEnergySample) are wired through this helper inside
 * realtime-simulation-client.tsx's Realtime event handlers specifically so an analytics exception
 * can never prevent the surrounding barge-in/metrics/dispatch logic from running.
 */
describe("safeCall", () => {
  it("runs fn normally when it does not throw, and never calls onError", () => {
    const fn = vi.fn();
    const onError = vi.fn();
    safeCall(fn, onError);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it("catches a thrown error and reports it via onError, without the exception propagating", () => {
    const boom = new Error("analytics exploded");
    const onError = vi.fn();
    expect(() =>
      safeCall(() => {
        throw boom;
      }, onError),
    ).not.toThrow();
    expect(onError).toHaveBeenCalledWith(boom);
  });

  it("lets a caller run critical logic AFTER an analytics call even when that analytics call throws", () => {
    // Simulates the exact shape used in realtime-simulation-client.tsx: an analytics call, then
    // critical logic (bargeIn/metrics/dispatch) that must run regardless of the analytics outcome.
    const criticalLogic = vi.fn();
    safeCall(() => {
      throw new Error("speechDeliveryTracker.openTurn failed");
    }, () => {});
    criticalLogic();
    expect(criticalLogic).toHaveBeenCalledTimes(1);
  });

  it("propagates a non-Error thrown value to onError too", () => {
    const onError = vi.fn();
    safeCall(() => {
      throw "a string throw";
    }, onError);
    expect(onError).toHaveBeenCalledWith("a string throw");
  });
});
