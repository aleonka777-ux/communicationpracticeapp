import { describe, expect, it, vi } from "vitest";
import { createBargeInController, DEFAULT_BARGE_IN_CONFIRM_MS } from "@/lib/realtime/bargeIn";
import { computeStartupConfirmMs, STARTUP_FOLLOWUP_CONFIRM_MS, STARTUP_GRACE_MS } from "@/lib/realtime/startupGuard";

/**
 * Exercises bargeIn.ts and startupGuard.ts wired together exactly as
 * realtime-simulation-client.tsx wires them, since the actual production bug (a startup echo
 * surviving the flat 500ms first-turn window) only shows up in the combination of the two:
 * bargeIn.ts's confirmMs is resolved fresh per speech_started, and the component supplies it via
 * computeStartupConfirmMs(elapsedSinceFirstAiAudioMs) while isFirstAiResponseRef is still true.
 */
function createManualScheduler() {
  let scheduled: { id: number; fn: () => void; ms: number } | null = null;
  let nextId = 1;
  return {
    setTimer: vi.fn((fn: () => void, ms: number) => {
      const id = nextId++;
      scheduled = { id, fn, ms };
      return id as unknown as ReturnType<typeof setTimeout>;
    }),
    clearTimer: vi.fn((id: ReturnType<typeof setTimeout>) => {
      if (scheduled && scheduled.id === (id as unknown as number)) scheduled = null;
    }),
    fire: () => {
      const s = scheduled;
      scheduled = null;
      s?.fn();
    },
    isScheduled: () => scheduled !== null,
    scheduledMs: () => scheduled?.ms,
  };
}

describe("startup barge-in guard — bargeIn + startupGuard wired together", () => {
  it("a startup echo lasting >500ms (but less than the required grace+follow-up) does NOT cancel the first AI response", () => {
    const scheduler = createManualScheduler();
    const onConfirmedBargeIn = vi.fn();
    const onImmediateSpeechStart = vi.fn();
    const isFirst = true;
    const elapsedSinceAudioStart = 0; // speech begins right as AI audio starts — the worst case observed in production

    const controller = createBargeInController({
      confirmMs: () => (isFirst ? computeStartupConfirmMs(elapsedSinceAudioStart) : DEFAULT_BARGE_IN_CONFIRM_MS),
      onImmediateSpeechStart,
      onConfirmedBargeIn,
      onSpeechStoppedAfterReport: vi.fn(),
      setTimer: scheduler.setTimer,
      clearTimer: scheduler.clearTimer,
    });

    controller.handleAiSpeakingChanged(true);
    controller.handleSpeechStarted();

    // Required duration is grace + follow-up, well past the old flat 500ms window.
    expect(scheduler.scheduledMs()).toBe(STARTUP_GRACE_MS + STARTUP_FOLLOWUP_CONFIRM_MS);

    // The echo event stops — the exact case that used to survive a flat 500ms confirmation and
    // get falsely confirmed (per the reproduced production timeline) is still just a "stop before
    // the timer fires" from the controller's point of view, and now the timer required far longer.
    controller.handleSpeechStopped();

    expect(onConfirmedBargeIn).not.toHaveBeenCalled();
    expect(onImmediateSpeechStart).not.toHaveBeenCalled();
    expect(scheduler.isScheduled()).toBe(false);
  });

  it("genuine sustained user speech during the opening response still cancels it, once the full grace+follow-up elapses", () => {
    const scheduler = createManualScheduler();
    const onConfirmedBargeIn = vi.fn();
    const isFirst = true;
    const elapsedSinceAudioStart = 0;

    const controller = createBargeInController({
      confirmMs: () => (isFirst ? computeStartupConfirmMs(elapsedSinceAudioStart) : DEFAULT_BARGE_IN_CONFIRM_MS),
      onImmediateSpeechStart: vi.fn(),
      onConfirmedBargeIn,
      onSpeechStoppedAfterReport: vi.fn(),
      setTimer: scheduler.setTimer,
      clearTimer: scheduler.clearTimer,
    });

    controller.handleAiSpeakingChanged(true);
    controller.handleSpeechStarted();
    expect(scheduler.scheduledMs()).toBe(STARTUP_GRACE_MS + STARTUP_FOLLOWUP_CONFIRM_MS);

    // Speech is still ongoing when the full required duration elapses — genuine barge-in.
    scheduler.fire();

    expect(onConfirmedBargeIn).toHaveBeenCalledTimes(1);
  });

  it("a startup echo occurring well into the grace period only needs the shrunken remaining duration, but still doesn't confirm if it's brief", () => {
    const scheduler = createManualScheduler();
    const onConfirmedBargeIn = vi.fn();
    const elapsedSinceAudioStart = 900; // 900ms into a 1000ms grace period

    const controller = createBargeInController({
      confirmMs: () => computeStartupConfirmMs(elapsedSinceAudioStart),
      onImmediateSpeechStart: vi.fn(),
      onConfirmedBargeIn,
      onSpeechStoppedAfterReport: vi.fn(),
      setTimer: scheduler.setTimer,
      clearTimer: scheduler.clearTimer,
    });

    controller.handleAiSpeakingChanged(true);
    controller.handleSpeechStarted();
    expect(scheduler.scheduledMs()).toBe(STARTUP_GRACE_MS - 900 + STARTUP_FOLLOWUP_CONFIRM_MS); // 600ms

    controller.handleSpeechStopped(); // brief — stops before that shrunken window elapses
    expect(onConfirmedBargeIn).not.toHaveBeenCalled();
  });

  it("later responses (after the first AI turn) revert completely to the normal 250ms behavior", () => {
    const scheduler = createManualScheduler();
    const onConfirmedBargeIn = vi.fn();
    const isFirst = false; // simulates isFirstAiResponseRef having already flipped to false

    const controller = createBargeInController({
      confirmMs: () => (isFirst ? computeStartupConfirmMs(0) : DEFAULT_BARGE_IN_CONFIRM_MS),
      onImmediateSpeechStart: vi.fn(),
      onConfirmedBargeIn,
      onSpeechStoppedAfterReport: vi.fn(),
      setTimer: scheduler.setTimer,
      clearTimer: scheduler.clearTimer,
    });

    controller.handleAiSpeakingChanged(true);
    controller.handleSpeechStarted();

    expect(scheduler.scheduledMs()).toBe(DEFAULT_BARGE_IN_CONFIRM_MS);
    expect(scheduler.scheduledMs()).not.toBe(STARTUP_GRACE_MS + STARTUP_FOLLOWUP_CONFIRM_MS);

    scheduler.fire();
    expect(onConfirmedBargeIn).toHaveBeenCalledTimes(1);
  });
});
