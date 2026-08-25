import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { waitForPendingUserTranscription } from "@/lib/realtime/pendingTranscription";

describe("waitForPendingUserTranscription", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves immediately when nothing is pending", async () => {
    const pendingRef = { current: false };
    const promise = waitForPendingUserTranscription(pendingRef, 4000, 100);
    await vi.advanceTimersByTimeAsync(0);
    await expect(promise).resolves.toBeUndefined();
  });

  it("waits until the pending flag clears, then resolves", async () => {
    const pendingRef = { current: true };
    const promise = waitForPendingUserTranscription(pendingRef, 4000, 100);

    await vi.advanceTimersByTimeAsync(250);
    pendingRef.current = false;
    await vi.advanceTimersByTimeAsync(100);

    await expect(promise).resolves.toBeUndefined();
  });

  it("gives up after the timeout if the flag never clears", async () => {
    const pendingRef = { current: true };
    const promise = waitForPendingUserTranscription(pendingRef, 500, 100);

    await vi.advanceTimersByTimeAsync(500);

    await expect(promise).resolves.toBeUndefined();
    expect(pendingRef.current).toBe(true);
  });
});
