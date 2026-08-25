import { describe, expect, it, vi } from "vitest";
import { createBargeInController, DEFAULT_BARGE_IN_CONFIRM_MS, type BargeInControllerOptions } from "@/lib/realtime/bargeIn";

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

function buildController(
  scheduler: ReturnType<typeof createManualScheduler>,
  extra?: Partial<BargeInControllerOptions>,
) {
  const onImmediateSpeechStart = vi.fn();
  const onConfirmedBargeIn = vi.fn();
  const onSpeechStoppedAfterReport = vi.fn();
  const controller = createBargeInController({
    onImmediateSpeechStart,
    onConfirmedBargeIn,
    onSpeechStoppedAfterReport,
    setTimer: scheduler.setTimer,
    clearTimer: scheduler.clearTimer,
    ...extra,
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

  describe("confirmMs as a function — supports a widened startup-only confirmation window", () => {
    it("resolves confirmMs fresh on every speech_started, not once at construction", () => {
      const scheduler = createManualScheduler();
      let isFirstAiResponse = true;
      const confirmMs = vi.fn(() => (isFirstAiResponse ? 500 : DEFAULT_BARGE_IN_CONFIRM_MS));
      const { controller } = buildController(scheduler, { confirmMs });

      controller.handleAiSpeakingChanged(true);
      controller.handleSpeechStarted();
      expect(scheduler.scheduledMs()).toBe(500);
      scheduler.fire();
      controller.handleSpeechStopped();

      // The first AI response has now finished — later turns should use the normal window.
      isFirstAiResponse = false;
      controller.handleAiSpeakingChanged(true);
      controller.handleSpeechStarted();
      expect(scheduler.scheduledMs()).toBe(DEFAULT_BARGE_IN_CONFIRM_MS);
    });

    it("a short startup echo/VAD blip during the first AI response does NOT cancel the AI, even with the widened window", () => {
      const scheduler = createManualScheduler();
      const { controller, onConfirmedBargeIn, onImmediateSpeechStart } = buildController(scheduler, { confirmMs: () => 500 });

      controller.handleAiSpeakingChanged(true);
      controller.handleSpeechStarted();
      expect(scheduler.scheduledMs()).toBe(500);

      // Stops well within the widened window, exactly like a click/breath/echo tail would.
      controller.handleSpeechStopped();

      expect(onConfirmedBargeIn).not.toHaveBeenCalled();
      expect(onImmediateSpeechStart).not.toHaveBeenCalled();
      expect(scheduler.isScheduled()).toBe(false);
    });

    it("real sustained user speech during the first AI response still interrupts it, just after the wider window", () => {
      const scheduler = createManualScheduler();
      const { controller, onConfirmedBargeIn } = buildController(scheduler, { confirmMs: () => 500 });

      controller.handleAiSpeakingChanged(true);
      controller.handleSpeechStarted();
      scheduler.fire(); // the full 500ms elapses while speech is still ongoing

      expect(onConfirmedBargeIn).toHaveBeenCalledTimes(1);
    });

    it("later-session genuine barge-in behavior is unaffected by the startup window having existed earlier", () => {
      const scheduler = createManualScheduler();
      let isFirstAiResponse = true;
      const { controller, onConfirmedBargeIn } = buildController(scheduler, {
        confirmMs: () => (isFirstAiResponse ? 500 : DEFAULT_BARGE_IN_CONFIRM_MS),
      });

      // First (startup) turn: a blip, correctly not interrupted.
      controller.handleAiSpeakingChanged(true);
      controller.handleSpeechStarted();
      controller.handleSpeechStopped();
      controller.handleAiSpeakingChanged(false);
      isFirstAiResponse = false;

      // Later turn: sustained speech interrupts using the normal (shorter) window, unchanged.
      controller.handleAiSpeakingChanged(true);
      controller.handleSpeechStarted();
      expect(scheduler.scheduledMs()).toBe(DEFAULT_BARGE_IN_CONFIRM_MS);
      scheduler.fire();
      expect(onConfirmedBargeIn).toHaveBeenCalledTimes(1);
    });

    it("repeated short startup blips cannot accumulate into a confirmed barge-in", () => {
      const scheduler = createManualScheduler();
      const { controller, onConfirmedBargeIn } = buildController(scheduler, { confirmMs: () => 500 });

      controller.handleAiSpeakingChanged(true);
      for (let i = 0; i < 5; i++) {
        controller.handleSpeechStarted();
        expect(scheduler.scheduledMs()).toBe(500); // each blip gets a fresh, full window — never shortened
        controller.handleSpeechStopped();
      }

      expect(onConfirmedBargeIn).not.toHaveBeenCalled();
      expect(scheduler.isScheduled()).toBe(false);
    });

    it("no stale confirmation timer survives speech_stopped, reset, or the AI response completing", () => {
      const scheduler = createManualScheduler();
      const { controller: a } = buildController(scheduler, { confirmMs: () => 500 });
      a.handleAiSpeakingChanged(true);
      a.handleSpeechStarted();
      a.handleSpeechStopped();
      expect(scheduler.isScheduled()).toBe(false);

      const { controller: b } = buildController(scheduler, { confirmMs: () => 500 });
      b.handleAiSpeakingChanged(true);
      b.handleSpeechStarted();
      b.reset();
      expect(scheduler.isScheduled()).toBe(false);

      const { controller: c } = buildController(scheduler, { confirmMs: () => 500 });
      c.handleAiSpeakingChanged(true);
      c.handleSpeechStarted();
      c.handleAiSpeakingChanged(false); // AI response completes mid-confirmation
      expect(scheduler.isScheduled()).toBe(false);
    });
  });
});
