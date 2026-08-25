import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { waitForCurrentExchangeToFinish } from "@/lib/realtime/exchangeCompletion";
import type { RealtimeConnectionState } from "@/lib/realtime/connectionState";

describe("waitForCurrentExchangeToFinish", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves immediately when nobody has the floor and nothing is pending", async () => {
    const stateRef = { current: "listening" as RealtimeConnectionState };
    const pendingRef = { current: false };
    const promise = waitForCurrentExchangeToFinish(stateRef, pendingRef, 20000, 150);
    await vi.advanceTimersByTimeAsync(0);
    await expect(promise).resolves.toBeUndefined();
  });

  it("waits while the user is speaking, then resolves once listening resumes", async () => {
    const stateRef = { current: "user_speaking" as RealtimeConnectionState };
    const pendingRef = { current: false };
    const promise = waitForCurrentExchangeToFinish(stateRef, pendingRef, 20000, 150);

    await vi.advanceTimersByTimeAsync(300);
    stateRef.current = "listening";
    await vi.advanceTimersByTimeAsync(150);

    await expect(promise).resolves.toBeUndefined();
  });

  it("waits through thinking and speaking (the AI's resulting response) before resolving", async () => {
    const stateRef = { current: "thinking" as RealtimeConnectionState };
    const pendingRef = { current: false };
    const promise = waitForCurrentExchangeToFinish(stateRef, pendingRef, 20000, 150);

    await vi.advanceTimersByTimeAsync(150);
    stateRef.current = "speaking";
    await vi.advanceTimersByTimeAsync(300);
    stateRef.current = "listening";
    await vi.advanceTimersByTimeAsync(150);

    await expect(promise).resolves.toBeUndefined();
  });

  it("also waits for a pending user transcription even once state is listening", async () => {
    const stateRef = { current: "listening" as RealtimeConnectionState };
    const pendingRef = { current: true };
    const promise = waitForCurrentExchangeToFinish(stateRef, pendingRef, 20000, 150);

    await vi.advanceTimersByTimeAsync(300);
    pendingRef.current = false;
    await vi.advanceTimersByTimeAsync(150);

    await expect(promise).resolves.toBeUndefined();
  });

  it("gives up after the timeout if the exchange never finishes, as a safety valve", async () => {
    const stateRef = { current: "speaking" as RealtimeConnectionState };
    const pendingRef = { current: false };
    const promise = waitForCurrentExchangeToFinish(stateRef, pendingRef, 500, 150);

    await vi.advanceTimersByTimeAsync(600);

    await expect(promise).resolves.toBeUndefined();
    expect(stateRef.current).toBe("speaking");
  });
});
