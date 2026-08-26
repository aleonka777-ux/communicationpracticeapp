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
 */

import type { SessionTimelineSnapshot } from "@/lib/realtime/sessionTimeline";
import type { SpeechDeliverySnapshot } from "@/lib/realtime/speechDeliveryTracker";
import type { MetricsPayload } from "@/lib/realtime/metricsPayload";

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
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
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

  return {
    userTurns,
    pauses,
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
