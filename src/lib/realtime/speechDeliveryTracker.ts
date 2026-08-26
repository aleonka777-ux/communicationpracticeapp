/**
 * Pure intra-utterance pause + relative-vocal-intensity tracker — Phase 4A evidence collection.
 * Consumes a stream of scalar RMS energy samples (pushed by src/lib/realtime/micEnergyMonitor.ts,
 * the thin browser Web Audio wrapper) and produces neutral EVIDENCE only: pause occurrences and
 * per-turn intensity aggregates. Never interprets a pause as strategic/hesitant/awkward, never
 * claims dB SPL, never stores raw audio or per-sample arrays beyond the lifetime of one open turn
 * (a turn's buffered samples are discarded the instant its aggregate is computed at closeTurn()).
 * See /docs/DECISIONS.md "Phase 4A: speech-delivery evidence" for the full design rationale.
 *
 * Silence/speech decision — a per-session ADAPTIVE noise floor, not a fixed absolute amplitude:
 * different microphones and rooms have very different noise floors, and `autoGainControl` (see
 * webrtcClient.ts's MIC_AUDIO_CONSTRAINTS) continuously renormalizes gain, so no single absolute
 * threshold could be meaningful across sessions/devices. `noiseFloor` is a classic fast-attack/
 * slow-release tracker: it drops instantly to a new quieter minimum (silence can begin at any
 * moment) but rises only slowly (NOISE_FLOOR_RELEASE_RATE) so it does not chase speech energy
 * upward and mistake loud, sustained speech for "the new normal". A sample counts as speech once it
 * clears `noiseFloor * SPEECH_THRESHOLD_MULTIPLIER`, with `ABSOLUTE_MIN_THRESHOLD` as a hard floor so
 * a near-silent room (noiseFloor close to 0) can't make the multiplier trivially satisfied by
 * electrical/quantization noise.
 *
 * Pause duration threshold — MIN_INTRA_PAUSE_MS, not an arbitrary number: ordinary phonetic
 * micro-gaps between syllables/words in fluent speech are well under 200ms; psycholinguistic pause
 * research (e.g. Goldman-Eisler's classic hesitation-pause studies) conventionally treats silences
 * at or above roughly a quarter of a second as a measurable "silent pause" distinct from normal
 * articulatory transitions. 250ms is also comfortably above this tracker's own sampling resolution
 * (DEFAULT_SAMPLE_INTERVAL_MS = 50ms, i.e. ~5 samples of margin) and ordinary browser timer jitter,
 * so a genuine threshold-crossing is not an artifact of sampling granularity. Precision claims are
 * bounded accordingly: a reported pause duration is accurate only to roughly one sample interval,
 * never to true millisecond precision.
 *
 * A pause still open exactly when the turn's own boundary (speech_stopped) arrives is deliberately
 * EXCLUDED, not reported as a trailing pause: OpenAI's server VAD already waits `silence_duration_ms`
 * (default 500ms) of silence before emitting speech_stopped, so trailing silence right at a turn's
 * end is that detection tail, not a pause the user resumed speaking after — counting it would double
 * up with a phenomenon the turn-boundary timing (sessionTimeline.ts) already reflects.
 *
 * Clock origin — fixed production bug (see /docs/DECISIONS.md "Phase 4A pause timestamp clock-origin
 * fix"): `pause.startMs` MUST be session-relative, on the same origin as sessionTimeline.ts's
 * `UserTurnMetric.startMs`/`endMs` and `SessionLevelMetrics.totalDurationMs`. This tracker
 * establishes that origin itself, exactly mirroring sessionTimeline.ts's own `sessionStartMs`/
 * `elapsed()` idiom: the injected/default clock (`options.now`, raw `performance.now()` by default)
 * is read ONCE at construction time and every subsequent timestamp this module produces is that raw
 * clock's value minus that captured start — i.e. "time since this tracker was created," not "time
 * since the page navigated." Previously this module used the injected clock's raw value DIRECTLY as
 * every timestamp, with no such subtraction — self-consistent internally (every duration/ratio is a
 * difference of two raw values, so those were already correct) but not zeroed at session start, so a
 * persisted `start_ms` was actually "ms since page load," not "ms since practice began." Because both
 * this tracker and sessionTimeline are constructed back-to-back, synchronously, in the same mount
 * effect (realtime-simulation-client.tsx), the residual skew between their two independently-captured
 * origins is sub-millisecond — negligible next to this module's own documented ~50ms sampling
 * resolution, and validated by mergeSpeechDeliveryEvidence.ts's cross-tracker tolerance checks.
 */

export type PausePositionBucket = "beginning" | "middle" | "end";

export interface IntraPauseEvidence {
  itemId: string;
  /** Session-relative start time (same clock as sessionTimeline.ts), per the injected `now()`. */
  startMs: number;
  durationMs: number;
  /** 0 (turn start) to 1 (turn end) — where the pause began, relative to this turn's own span. */
  positionRatio: number;
  positionBucket: PausePositionBucket;
}

export interface TurnIntensityEvidence {
  itemId: string;
  avgRelativeIntensity: number;
  peakRelativeIntensity: number;
  /** Population standard deviation of the turn's RMS samples — a neutral variability figure, not a
   *  judgment about vocal control. */
  intensityVariability: number;
  sampleCount: number;
}

export interface SpeechDeliverySnapshot {
  pauses: IntraPauseEvidence[];
  turnIntensity: TurnIntensityEvidence[];
}

export interface SpeechDeliveryTrackerOptions {
  /** RAW monotonic clock — defaults to performance.now(). Injectable for deterministic tests,
   *  matching sessionTimeline.ts's own SessionTimelineOptions.now pattern. This is read once at
   *  construction to establish this tracker's own session-relative zero point (see the module doc
   *  comment's "Clock origin" section) — every timestamp this module actually produces is relative
   *  to that captured start, never this raw value directly. */
  now?: () => number;
}

export interface SpeechDeliveryTracker {
  openTurn(itemId: string): void;
  closeTurn(itemId: string): void;
  /** One scalar RMS energy reading (unitless, relative — see micEnergyMonitor.ts). Never a raw
   *  audio buffer/array. */
  pushEnergySample(rms: number): void;
  finalize(): SpeechDeliverySnapshot;
}

/** ~20Hz — fine enough to resolve MIN_INTRA_PAUSE_MS with several samples of margin, coarse enough
 *  to be cheap. See the module doc comment; not a promise of finer time resolution than this. */
export const DEFAULT_SAMPLE_INTERVAL_MS = 50;

/** See the module doc comment's pause-threshold rationale. */
const MIN_INTRA_PAUSE_MS = 250;

const NOISE_FLOOR_RELEASE_RATE = 0.01;
const SPEECH_THRESHOLD_MULTIPLIER = 3;
const ABSOLUTE_MIN_THRESHOLD = 0.002;
const INITIAL_NOISE_FLOOR = 0.001;

function positionBucketFor(ratio: number): PausePositionBucket {
  if (ratio < 1 / 3) return "beginning";
  if (ratio < 2 / 3) return "middle";
  return "end";
}

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function stddev(values: number[], avg: number): number {
  const variance = mean(values.map((v) => (v - avg) ** 2));
  return Math.sqrt(variance);
}

interface OpenTurnState {
  itemId: string;
  startMs: number;
  samples: number[];
  /** Session-relative time the current run of below-threshold samples began, or null if the most
   *  recent sample was speech-level energy. */
  silenceStartMs: number | null;
  /** Candidate pauses closed by a return to speech energy — positionRatio is filled in once the
   *  turn itself closes and its true duration is known. */
  rawPauses: Array<{ startMs: number; durationMs: number }>;
}

export function createSpeechDeliveryTracker(options: SpeechDeliveryTrackerOptions = {}): SpeechDeliveryTracker {
  const rawNow = options.now ?? (() => performance.now());
  // Establish this tracker's own session-relative zero point, exactly mirroring
  // sessionTimeline.ts's `sessionStartMs`/`elapsed()` idiom — see the module doc comment's "Clock
  // origin" section. Every timestamp below is relative to THIS instant, never the raw clock value.
  const sessionStartMs = rawNow();
  const now = () => rawNow() - sessionStartMs;

  let noiseFloor = INITIAL_NOISE_FLOOR;
  const openTurns = new Map<string, OpenTurnState>();
  const pauses: IntraPauseEvidence[] = [];
  const turnIntensity: TurnIntensityEvidence[] = [];

  function updateNoiseFloor(sample: number) {
    if (sample < noiseFloor) {
      noiseFloor = sample; // fast attack — silence can begin at any instant
    } else {
      noiseFloor += (sample - noiseFloor) * NOISE_FLOOR_RELEASE_RATE; // slow release
    }
  }

  function isSpeechEnergy(sample: number): boolean {
    return sample >= Math.max(noiseFloor * SPEECH_THRESHOLD_MULTIPLIER, ABSOLUTE_MIN_THRESHOLD);
  }

  return {
    openTurn(itemId) {
      if (openTurns.has(itemId)) return; // duplicate event guard, matching sessionTimeline.ts
      openTurns.set(itemId, { itemId, startMs: now(), samples: [], silenceStartMs: null, rawPauses: [] });
    },

    closeTurn(itemId) {
      const turn = openTurns.get(itemId);
      if (!turn) return;
      openTurns.delete(itemId);

      const endMs = now();
      const durationMs = endMs - turn.startMs;

      // A pause still open at turn close is a VAD detection tail, not a resumed-speech pause — see
      // the module doc comment. Only fully closed (speech-resumed) pauses are ever reported.
      if (durationMs > 0) {
        for (const raw of turn.rawPauses) {
          const positionRatio = Math.min(1, Math.max(0, (raw.startMs - turn.startMs) / durationMs));
          pauses.push({
            itemId,
            startMs: raw.startMs,
            durationMs: raw.durationMs,
            positionRatio,
            positionBucket: positionBucketFor(positionRatio),
          });
        }
      }

      if (turn.samples.length > 0) {
        const avg = mean(turn.samples);
        turnIntensity.push({
          itemId,
          avgRelativeIntensity: avg,
          peakRelativeIntensity: Math.max(...turn.samples),
          intensityVariability: stddev(turn.samples, avg),
          sampleCount: turn.samples.length,
        });
      }
    },

    pushEnergySample(rms) {
      updateNoiseFloor(rms);

      for (const turn of openTurns.values()) {
        turn.samples.push(rms);
        const speech = isSpeechEnergy(rms);
        const t = now();
        if (!speech) {
          if (turn.silenceStartMs === null) turn.silenceStartMs = t;
        } else if (turn.silenceStartMs !== null) {
          const durationMs = t - turn.silenceStartMs;
          if (durationMs >= MIN_INTRA_PAUSE_MS) {
            turn.rawPauses.push({ startMs: turn.silenceStartMs, durationMs });
          }
          turn.silenceStartMs = null;
        }
      }
    },

    finalize(): SpeechDeliverySnapshot {
      // Close any still-open turn so nothing is silently dropped — mirrors sessionTimeline.ts's
      // finalize() closing any still-open turn at session end. Its trailing silence (if any) is
      // still excluded by the same rule as an ordinary close, per the module doc comment.
      for (const itemId of [...openTurns.keys()]) {
        this.closeTurn(itemId);
      }
      return { pauses: [...pauses], turnIntensity: [...turnIntensity] };
    },
  };
}
