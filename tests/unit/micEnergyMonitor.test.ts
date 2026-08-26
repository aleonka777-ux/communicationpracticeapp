import { describe, expect, it, vi, afterEach } from "vitest";
import { startMicEnergyMonitor } from "@/lib/realtime/micEnergyMonitor";

/**
 * micEnergyMonitor.ts is the thin, browser-only Web Audio wrapper (same role as webrtcClient.ts —
 * see its own doc comment). jsdom has no real AudioContext, so this stubs the minimal shape used by
 * the module to verify two structural guarantees without needing real audio hardware: (1) the
 * analyser is wired FROM the mic source only, never to audioContext.destination (so the user is
 * never made to hear their own mic played back), and (2) only scalar RMS numbers ever reach the
 * caller — no raw sample array is exposed.
 */

class FakeAnalyserNode {
  fftSize = 0;
  connectedTo: unknown[] = [];
  connect(dest: unknown) {
    this.connectedTo.push(dest);
  }
  disconnect() {}
  getFloatTimeDomainData(buffer: Float32Array) {
    buffer.fill(0.05); // deterministic non-zero "signal"
  }
}

class FakeMediaStreamAudioSourceNode {
  connectedTo: unknown[] = [];
  connect(dest: unknown) {
    this.connectedTo.push(dest);
  }
  disconnect() {}
}

class FakeAudioContext {
  destination = { __isDestination: true };
  closed = false;
  lastSource: FakeMediaStreamAudioSourceNode | null = null;
  lastAnalyser: FakeAnalyserNode | null = null;
  createMediaStreamSource() {
    this.lastSource = new FakeMediaStreamAudioSourceNode();
    return this.lastSource;
  }
  createAnalyser() {
    this.lastAnalyser = new FakeAnalyserNode();
    return this.lastAnalyser;
  }
  close() {
    this.closed = true;
    return Promise.resolve();
  }
}

describe("startMicEnergyMonitor", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("connects the mic source to the analyser only — never to audioContext.destination", () => {
    let capturedContext: FakeAudioContext | null = null;
    // A constructor function that returns an explicit object overrides `new`'s default instance —
    // this lets the test capture the created context without aliasing `this` (banned by
    // @typescript-eslint/no-this-alias).
    function CapturingFakeAudioContext() {
      const instance = new FakeAudioContext();
      capturedContext = instance;
      return instance;
    }
    vi.stubGlobal("window", { AudioContext: CapturingFakeAudioContext });

    const fakeStream = {} as MediaStream;
    const handle = startMicEnergyMonitor(fakeStream, () => {});
    handle.stop();

    expect(capturedContext).not.toBeNull();
    const source = capturedContext!.lastSource!;
    const analyser = capturedContext!.lastAnalyser!;
    // The source connects to the analyser, and nothing (source or analyser) ever connects to
    // audioContext.destination — the user must never hear their own mic played back.
    expect(source.connectedTo).toEqual([analyser]);
    expect(source.connectedTo).not.toContain(capturedContext!.destination);
    expect(analyser.connectedTo).not.toContain(capturedContext!.destination);
  });

  it("only ever hands the callback a scalar number, never a buffer/array", () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", { AudioContext: FakeAudioContext });

    const samples: unknown[] = [];
    const handle = startMicEnergyMonitor({} as MediaStream, (rms) => samples.push(rms), 50);

    vi.advanceTimersByTime(200); // a handful of ticks

    handle.stop();

    expect(samples.length).toBeGreaterThan(0);
    for (const s of samples) {
      expect(typeof s).toBe("number");
      expect(s).toBeCloseTo(0.05, 5); // RMS of a constant 0.05 signal is 0.05
    }
  });

  it("stop() clears the interval so no further samples are produced", () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", { AudioContext: FakeAudioContext });

    const onSample = vi.fn();
    const handle = startMicEnergyMonitor({} as MediaStream, onSample, 50);
    vi.advanceTimersByTime(100);
    const countAtStop = onSample.mock.calls.length;
    handle.stop();
    vi.advanceTimersByTime(500);

    expect(onSample.mock.calls.length).toBe(countAtStop);
  });
});
