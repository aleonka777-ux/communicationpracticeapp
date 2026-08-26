/**
 * Merges the two independent Phase 4A measurement sources — sessionTimeline.ts's per-turn
 * transcript-derived evidence (word count, speaking rate, filler candidates) and
 * speechDeliveryTracker.ts's live-audio-derived evidence (intra-utterance pauses, relative
 * intensity) — into the shape realtime-simulation-client.tsx posts to
 * /api/simulation/realtime/metrics. Pure and synchronous so the merge logic itself is directly
 * unit-testable without any DOM/Web Audio API. See /docs/DECISIONS.md "Phase 4A: speech-delivery
 * evidence" for why these two are separate trackers in the first place (one needs only the final
 * transcript + turn duration already known to sessionTimeline; the other needs live mic-energy
 * sampling that only exists while the WebRTC connection is open).
 *
 * Accuracy safeguard: pause evidence is filtered to CONFIRMED user turns only — a suspected_noise
 * event (likely speaker echo) was never established as real user speech, so any pause the live
 * energy analyser happened to observe during one must not be reported as evidence of a real
 * communication turn's delivery.
 *
 * Clock-origin invariant checks: sessionTimeline.ts and speechDeliveryTracker.ts are two
 * INDEPENDENTLY self-anchored session-relative clocks (each captures its own zero point at its own
 * construction time — see speechDeliveryTracker.ts's "Clock origin" doc comment for the production
 * bug this fixed, where the pause tracker persisted raw, un-anchored performance.now() values). This
 * module validates, at merge time, that a pause's now-canonical `startMs` is actually consistent
 * with the owning turn's sessionTimeline-derived boundaries and the session's own total duration —
 * never used to clamp/reject data, only to surface a lifecycle/clock-origin bug loudly (the same
 * philosophy as sessionTimeline.ts's own validateSessionTimelineInvariants()). Every check below
 * should always pass under correct operation; a violation means a clock-origin regression, not a
 * legitimate edge case to accommodate.
 */

import { DEFAULT_SAMPLE_INTERVAL_MS, type SpeechDeliverySnapshot } from "@/lib/realtime/speechDeliveryTracker";
import type { SessionTimelineSnapshot } from "@/lib/realtime/sessionTimeline";
import type { MetricsPayload } from "@/lib/realtime/metricsPayload";

/**
 * Tolerance for cross-tracker timestamp comparisons (pause vs. its owning turn's sessionTimeline
 * boundaries, or vs. the session's own total duration). Two independently-anchored clocks
 * constructed synchronously, back-to-back, in the same mount effect differ by sub-millisecond
 * construction skew — this is deliberately far more generous: twice this module's own documented
 * sampling resolution (DEFAULT_SAMPLE_INTERVAL_MS, 50ms), to also absorb ordinary sample-boundary
 * rounding (a pause's true edge can land anywhere within one sample tick of either tracker).
 */
const CLOCK_ALIGNMENT_TOLERANCE_MS = DEFAULT_SAMPLE_INTERVAL_MS * 2;

/** Tolerance for re-deriving position_ratio from the owning turn's CANONICAL (sessionTimeline)
 *  boundaries and comparing it to the value speechDeliveryTracker.ts already computed internally
 *  (from its own, independently-anchored turn boundaries). 2% comfortably covers the same
 *  cross-tracker construction/sampling skew described above, expressed as a fraction of a typical
 *  multi-second turn, without being loose enough to miss a genuine mismatch. */
const POSITION_RATIO_TOLERANCE = 0.02;

export interface SessionPauseAggregates {
  intraPauseCount: number;
  totalIntraPauseMs: number;
  avgIntraPauseMs: number | null;
  medianIntraPauseMs: number | null;
  longestIntraPauseMs: number | null;
  pausesPerMinuteSpeaking: number | null;
}

export interface MergedSpeechDeliveryEvidence {
  userTurns: MetricsPayload["userTurns"];
  pauses: MetricsPayload["pauses"];
  sessionPauseAggregates: SessionPauseAggregates;
  /** Human-readable descriptions of any clock-origin/lifecycle invariant violated by this merge —
   *  see the module doc comment. Empty in the normal case. Diagnostic only: never used to
   *  clamp/reject/filter the returned pauses. */
  invariantViolations: string[];
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Validates every pause against the canonical session-relative clock (sessionTimeline's own turn
 * boundaries and total session duration) — see the module doc comment. Pure, returns violation
 * strings rather than logging/throwing itself, so it stays trivially unit-testable; the caller
 * decides how to surface them (realtime-simulation-client.tsx logs via console.error, matching
 * sessionTimeline.ts's own validateSessionTimelineInvariants() pattern).
 */
function validatePauseClockOrigin(
  pauses: MetricsPayload["pauses"],
  confirmedTurnsByItemId: ReadonlyMap<string, { startMs: number; endMs: number }>,
  totalDurationMs: number,
): string[] {
  const violations: string[] = [];

  for (const pause of pauses) {
    if (pause.startMs < 0) {
      violations.push(`Pause on turn ${pause.itemId} has start_ms (${pause.startMs}) < 0.`);
    }
    if (pause.startMs > totalDurationMs) {
      violations.push(`Pause on turn ${pause.itemId} has start_ms (${pause.startMs}) exceeding total_duration_ms (${totalDurationMs}).`);
    }
    if (pause.startMs + pause.durationMs > totalDurationMs + CLOCK_ALIGNMENT_TOLERANCE_MS) {
      violations.push(
        `Pause on turn ${pause.itemId} ends (${pause.startMs + pause.durationMs}) after total_duration_ms (${totalDurationMs}) beyond the ${CLOCK_ALIGNMENT_TOLERANCE_MS}ms tolerance.`,
      );
    }

    const turn = confirmedTurnsByItemId.get(pause.itemId);
    if (!turn) continue; // attribution to a non-confirmed/unknown turn is checked elsewhere (merge filtering)

    if (pause.startMs < turn.startMs - CLOCK_ALIGNMENT_TOLERANCE_MS || pause.startMs > turn.endMs + CLOCK_ALIGNMENT_TOLERANCE_MS) {
      violations.push(
        `Pause start_ms (${pause.startMs}) falls outside owning turn ${pause.itemId}'s span (${turn.startMs} -> ${turn.endMs}) beyond the ${CLOCK_ALIGNMENT_TOLERANCE_MS}ms tolerance — likely clock-origin mismatch between sessionTimeline.ts and speechDeliveryTracker.ts.`,
      );
    }

    const turnDurationMs = turn.endMs - turn.startMs;
    if (turnDurationMs > 0) {
      const expectedRatio = (pause.startMs - turn.startMs) / turnDurationMs;
      if (Math.abs(expectedRatio - pause.positionRatio) > POSITION_RATIO_TOLERANCE) {
        violations.push(
          `Pause on turn ${pause.itemId} has position_ratio (${pause.positionRatio}) inconsistent with its canonical start_ms (expected ~${expectedRatio.toFixed(4)}).`,
        );
      }
    }
  }

  return violations;
}

export function mergeSpeechDeliveryEvidence(
  timelineSnapshot: SessionTimelineSnapshot,
  deliverySnapshot: SpeechDeliverySnapshot,
): MergedSpeechDeliveryEvidence {
  const confirmedItemIds = new Set(
    timelineSnapshot.userTurns.filter((t) => t.classification === "confirmed").map((t) => t.itemId),
  );
  const intensityByItemId = new Map(deliverySnapshot.turnIntensity.map((i) => [i.itemId, i]));

  const userTurns: MetricsPayload["userTurns"] = timelineSnapshot.userTurns.map((t) => {
    const intensity = intensityByItemId.get(t.itemId) ?? null;
    return {
      ...t,
      avgRelativeIntensity: intensity?.avgRelativeIntensity ?? null,
      peakRelativeIntensity: intensity?.peakRelativeIntensity ?? null,
      intensityVariability: intensity?.intensityVariability ?? null,
    };
  });

  const pauses: MetricsPayload["pauses"] = deliverySnapshot.pauses.filter((p) => confirmedItemIds.has(p.itemId));

  const pauseDurations = pauses.map((p) => p.durationMs);
  const totalIntraPauseMs = pauseDurations.reduce((sum, v) => sum + v, 0);
  const totalUserSpeakingMs = timelineSnapshot.session.totalUserSpeakingMs;

  const confirmedTurnsByItemId = new Map(
    timelineSnapshot.userTurns
      .filter((t) => t.classification === "confirmed")
      .map((t) => [t.itemId, { startMs: t.startMs, endMs: t.endMs }] as const),
  );
  const invariantViolations = validatePauseClockOrigin(pauses, confirmedTurnsByItemId, timelineSnapshot.session.totalDurationMs);

  return {
    userTurns,
    pauses,
    invariantViolations,
    sessionPauseAggregates: {
      intraPauseCount: pauses.length,
      totalIntraPauseMs,
      avgIntraPauseMs: pauseDurations.length > 0 ? totalIntraPauseMs / pauseDurations.length : null,
      medianIntraPauseMs: median(pauseDurations),
      longestIntraPauseMs: pauseDurations.length > 0 ? Math.max(...pauseDurations) : null,
      pausesPerMinuteSpeaking: totalUserSpeakingMs > 0 ? pauses.length / (totalUserSpeakingMs / 60000) : null,
    },
  };
}
