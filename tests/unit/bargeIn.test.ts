import { describe, expect, it, vi } from "vitest";
import { createBargeInController, DEFAULT_BARGE_IN_CONFIRM_MS } from "@/lib/realtime/bargeIn";

/**
 * Deterministic manual scheduler — bargeIn.ts only ever has one active timer at a time (a new
 * speech_started always clears any previous one first), so a single-slot fake is enough and
 * avoids any dependency on real/faked wall-clock timers.
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

function buildController(scheduler: ReturnType<typeof createManualScheduler>) {
  const onImmediateSpeechStart = vi.fn();
  const onConfirmedBargeIn = vi.fn();
  const onSpeechStoppedAfterReport = vi.fn();
  const controller = createBargeInController({
    onImmediateSpeechStart,
    onConfirmedBargeIn,
    onSpeechStoppedAfterReport,
    setTimer: scheduler.setTimer,
    clearTimer: scheduler.clearTimer,
  });
  return { controller, onImmediateSpeechStart, onConfirmedBargeIn, onSpeechStoppedAfterReport };
}

describe("createBargeInController", () => {
  it("a brief false speech event while the AI is speaking does NOT interrupt it", () => {
    const scheduler = createManualScheduler();
    const { controller, onConfirmedBargeIn, onImmediateSpeechStart, onSpeechStoppedAfterReport } = buildController(scheduler);

    controller.handleAiSpeakingChanged(true);
    controller.handleSpeechStarted();
    expect(scheduler.isScheduled()).toBe(true);

    // Stops before the confirmation window elapses — a click/breath/echo blip.
    controller.handleSpeechStopped();

    expect(onConfirmedBargeIn).not.toHaveBeenCalled();
    expect(onImmediateSpeechStart).not.toHaveBeenCalled();
    expect(onSpeechStoppedAfterReport).not.toHaveBeenCalled();
    expect(scheduler.isScheduled()).toBe(false);
  });

  it("sustained genuine speech while the AI is speaking DOES interrupt it", () => {
    const scheduler = createManualScheduler();
    const { controller, onConfirmedBargeIn, onSpeechStoppedAfterReport } = buildController(scheduler);

    controller.handleAiSpeakingChanged(true);
    controller.handleSpeechStarted();
    scheduler.fire(); // confirmation window elapses while speech is still ongoing

    expect(onConfirmedBargeIn).toHaveBeenCalledTimes(1);

    controller.handleSpeechStopped();
    expect(onSpeechStoppedAfterReport).toHaveBeenCalledTimes(1);
  });

  it("normal user speech while the AI is listening starts a turn immediately, no delay", () => {
    const scheduler = createManualScheduler();
    const { controller, onImmediateSpeechStart, onSpeechStoppedAfterReport } = buildController(scheduler);

    controller.handleAiSpeakingChanged(false);
    controller.handleSpeechStarted();

    expect(onImmediateSpeechStart).toHaveBeenCalledTimes(1);
    expect(scheduler.isScheduled()).toBe(false); // no confirmation window needed

    controller.handleSpeechStopped();
    expect(onSpeechStoppedAfterReport).toHaveBeenCalledTimes(1);
  });

  it("uses the configured confirmation window, defaulting to DEFAULT_BARGE_IN_CONFIRM_MS", () => {
    const scheduler = createManualScheduler();
    const { controller } = buildController(scheduler);
    controller.handleAiSpeakingChanged(true);
    controller.handleSpeechStarted();
    expect(scheduler.scheduledMs()).toBe(DEFAULT_BARGE_IN_CONFIRM_MS);
  });

  it("does not leave the conversation stuck: AI finishing naturally mid-confirmation promotes it to a normal turn", () => {
    const scheduler = createManualScheduler();
    const { controller, onConfirmedBargeIn, onImmediateSpeechStart, onSpeechStoppedAfterReport } = buildController(scheduler);

    controller.handleAiSpeakingChanged(true);
    controller.handleSpeechStarted();
    expect(scheduler.isScheduled()).toBe(true);

    // The AI's own response finishes on its own before the window elapses — nothing left to
    // protect, so this becomes an ordinary turn rather than being stuck waiting forever.
    controller.handleAiSpeakingChanged(false);

    expect(scheduler.isScheduled()).toBe(false);
    expect(onImmediateSpeechStart).toHaveBeenCalledTimes(1);
    expect(onConfirmedBargeIn).not.toHaveBeenCalled();

    controller.handleSpeechStopped();
    expect(onSpeechStoppedAfterReport).toHaveBeenCalledTimes(1);
  });

  it("does not leave the conversation stuck: reset() clears a pending confirmation with no side effects", () => {
    const scheduler = createManualScheduler();
    const { controller, onConfirmedBargeIn, onImmediateSpeechStart } = buildController(scheduler);

    controller.handleAiSpeakingChanged(true);
    controller.handleSpeechStarted();
    expect(scheduler.isScheduled()).toBe(true);

    controller.reset();
    expect(scheduler.isScheduled()).toBe(false);

    // A stale scheduled callback firing after reset (if it somehow still ran) must not resurrect
    // a decision about a segment that no longer exists.
    controller.handleSpeechStopped();
    expect(onConfirmedBargeIn).not.toHaveBeenCalled();
    expect(onImmediateSpeechStart).not.toHaveBeenCalled();
  });

  it("a new speech_started always clears any previous pending timer (no leaked/duplicate timers)", () => {
    const scheduler = createManualScheduler();
    const { controller } = buildController(scheduler);

    controller.handleAiSpeakingChanged(true);
    controller.handleSpeechStarted();
    const firstClearCalls = scheduler.clearTimer.mock.calls.length;
    controller.handleSpeechStarted();

    expect(scheduler.clearTimer.mock.calls.length).toBeGreaterThan(firstClearCalls);
    expect(scheduler.isScheduled()).toBe(true); // exactly one still active, not two
  });
});
