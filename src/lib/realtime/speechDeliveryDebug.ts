/**
 * Debug/QA formatting for Phase 4A speech-delivery evidence — development use only (console.debug
 * from realtime-simulation-client.tsx, same pattern as formatSessionTimelineDebugLines in
 * sessionTimeline.ts), never shown in production UI. Presents raw EVIDENCE per confirmed user turn:
 * word count/rate, intra-utterance pauses (with position), filler/disfluency candidates (always
 * "unclassified"), and relative intensity — never a judgment about any of them. See
 * /docs/DECISIONS.md "Phase 4A: speech-delivery evidence" for the full design.
 */

import type { MetricsPayload } from "@/lib/realtime/metricsPayload";

export function formatSpeechDeliveryDebugLines(
  userTurns: MetricsPayload["userTurns"],
  pauses: MetricsPayload["pauses"],
  fillerCandidates: MetricsPayload["fillerCandidates"],
): string[] {
  const lines: string[] = [];
  const confirmedTurns = userTurns.filter((t) => t.classification === "confirmed" && t.turnIndex !== null);

  for (const turn of confirmedTurns) {
    lines.push(`User turn ${turn.turnIndex}`);
    lines.push(`  duration: ${(turn.durationMs / 1000).toFixed(1)}s`);
    lines.push(`  words: ${turn.wordCount ?? "n/a"}`);
    lines.push(`  speaking rate: ${turn.speakingRateWpm !== null ? `${turn.speakingRateWpm.toFixed(0)} WPM` : "n/a (turn too short)"}`);

    const turnPauses = pauses.filter((p) => p.itemId === turn.itemId);
    if (turnPauses.length > 0) {
      lines.push(`  intra-turn pauses:`);
      for (const p of turnPauses) {
        lines.push(`    - ${(p.durationMs / 1000).toFixed(1)}s at ${(p.positionRatio * 100).toFixed(0)}% of turn (${p.positionBucket})`);
      }
    }

    const turnCandidates = fillerCandidates.filter((c) => c.itemId === turn.itemId);
    if (turnCandidates.length > 0) {
      lines.push(`  filler/disfluency candidates:`);
      for (const c of turnCandidates) {
        lines.push(`    - "${c.phrase}" [${c.category}, ${c.classification}] — …${c.contextBefore}⟨${c.phrase}⟩${c.contextAfter}…`);
      }
    }

    if (turn.avgRelativeIntensity !== null) {
      lines.push(`  relative intensity (unitless, NOT dB SPL):`);
      lines.push(`    avg: ${turn.avgRelativeIntensity.toFixed(4)}`);
      lines.push(`    peak: ${(turn.peakRelativeIntensity ?? 0).toFixed(4)}`);
      lines.push(`    variability: ${(turn.intensityVariability ?? 0).toFixed(4)}`);
    }

    lines.push("");
  }

  return lines;
}
