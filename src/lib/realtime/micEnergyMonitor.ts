/**
 * Browser-only Web Audio wrapper — reads live RMS energy off the LOCAL microphone stream (never the
 * remote AI audio) and hands scalar numbers to a callback. This is the thin, non-unit-testable
 * browser-API layer (same role as webrtcClient.ts) sitting in front of the pure, fully-testable
 * src/lib/realtime/speechDeliveryTracker.ts. Deliberately minimal: no MediaRecorder, no persistence,
 * no copy of any sample buffer ever leaves this function — a single Float32Array is allocated once
 * and reused every tick purely as AnalyserNode's required scratch space, then reduced to one RMS
 * float before anything is handed to the caller. See /docs/DECISIONS.md "Phase 4A: speech-delivery
 * evidence" for the privacy boundary this preserves (transient in-memory processing only, no raw
 * audio persisted).
 *
 * The analyser is connected FROM the mic source only — never to `audioContext.destination` — so this
 * can never cause the user to hear their own microphone played back.
 */

export interface MicEnergyMonitorHandle {
  stop(): void;
}

const DEFAULT_INTERVAL_MS = 50;

function computeRms(samples: Float32Array): number {
  let sumSquares = 0;
  for (let i = 0; i < samples.length; i++) sumSquares += samples[i] * samples[i];
  return Math.sqrt(sumSquares / samples.length);
}

/**
 * Starts sampling RMS energy from `stream` (the local mic MediaStream) at roughly `intervalMs`.
 * Returns a handle whose `stop()` clears the interval and releases the audio graph/context —
 * always call it (mirrors RealtimeConnection.close()'s responsibility for the mic track itself).
 */
export function startMicEnergyMonitor(
  stream: MediaStream,
  onSample: (rms: number) => void,
  intervalMs = DEFAULT_INTERVAL_MS,
): MicEnergyMonitorHandle {
  const AudioContextCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const audioContext = new AudioContextCtor();
  const source = audioContext.createMediaStreamSource(stream);
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 2048;
  source.connect(analyser); // deliberately NOT analyser.connect(audioContext.destination)

  const buffer = new Float32Array(analyser.fftSize);
  const intervalId = setInterval(() => {
    analyser.getFloatTimeDomainData(buffer);
    onSample(computeRms(buffer));
  }, intervalMs);

  return {
    stop() {
      clearInterval(intervalId);
      try {
        source.disconnect();
        analyser.disconnect();
      } catch {
        // already disconnected — safe to ignore
      }
      void audioContext.close().catch(() => {
        // already closed, or the browser refused a second close — never fail teardown over this
      });
    },
  };
}
