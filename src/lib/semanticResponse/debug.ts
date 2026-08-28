/**
 * Debug/QA formatting for Phase 4B.1A Semantic Responses — development use only, mirroring
 * src/lib/realtime/speechDeliveryDebug.ts's own pattern. Presents the grouping result so it can be
 * compared by hand against the raw production timeline (section 23 of the Phase 4B.1A spec): which
 * raw turns were grouped, the bridge gaps between them, why (grouping confidence/reasons), and the
 * resulting transcript coverage/WPM. Never shown in production UI.
 */

import type { RawUserTurnInput, SemanticResponse } from "@/lib/semanticResponse/types";

export function formatSemanticResponseDebugLines(responses: SemanticResponse[], rawTurns: RawUserTurnInput[]): string[] {
  const lines: string[] = [];
  const turnsByItemId = new Map(rawTurns.map((t) => [t.itemId, t]));

  for (const response of responses) {
    lines.push(`Semantic Response ${response.responseIndex}`);
    lines.push(`  algorithm: ${response.groupingAlgorithmVersion}`);
    lines.push(`  raw turns: [${response.constituentTurns.map((t) => turnsByItemId.get(t.itemId)?.itemId ?? t.itemId).join(", ")}]`);
    lines.push(`  start: ${response.startMs.toFixed(1)}`);
    lines.push(`  end: ${response.endMs.toFixed(1)}`);
    lines.push(`  span duration: ${(response.spanDurationMs / 1000).toFixed(1)}s`);

    const bridgeGaps = response.constituentTurns.filter((t) => t.gapBeforeMs !== null);
    if (bridgeGaps.length > 0) {
      lines.push(`  bridge gaps:`);
      for (const t of bridgeGaps) {
        lines.push(`    - ${(t.gapBeforeMs as number).toFixed(1)}ms before ${t.itemId}${t.gapCountsAsMeaningfulPause ? " (counts as meaningful pause)" : " (technical bridge only)"}`);
      }
    }

    lines.push(`  grouping: ${response.groupingConfidence ?? "n/a (single raw turn)"}`);
    if (response.groupingReasons.length > 0) {
      lines.push(`  reasons:`);
      for (const r of response.groupingReasons) lines.push(`    - ${r}`);
    }
    if (response.precedingBoundaryDecision !== null) {
      lines.push(`  preceding boundary: ${response.precedingBoundaryDecision} (gap ${response.precedingBoundaryGapMs?.toFixed(1)}ms)`);
    }

    lines.push(`  transcript coverage: ${response.transcriptCoverage}`);
    if (response.transcriptCoverage === "complete") {
      lines.push(`  combined transcript: "${response.combinedTranscript}"`);
      lines.push(`  words: ${response.wordCount}`);
      lines.push(`  WPM: ${response.semanticResponseWpm !== null ? response.semanticResponseWpm.toFixed(0) : "unavailable (too few words)"}`);
    } else {
      lines.push(`  WPM: unavailable (transcript coverage ${response.transcriptCoverage})`);
    }

    lines.push(`  response latency: ${response.responseLatencyMs !== null ? `${response.responseLatencyMs.toFixed(1)}ms` : "unavailable (no valid adjacent AI turn)"}`);

    if (response.avgRelativeIntensity !== null) {
      lines.push(`  relative intensity (unitless, NOT dB SPL):`);
      lines.push(`    avg: ${response.avgRelativeIntensity.toFixed(4)}`);
      lines.push(`    peak: ${(response.peakRelativeIntensity ?? 0).toFixed(4)}`);
      if (response.intensityVariability !== null) lines.push(`    variability (approximate): ${response.intensityVariability.toFixed(4)}`);
    }

    lines.push(`  interaction flags: started_while_ai_speaking=${response.startedWhileAiSpeaking}, user_interrupted_ai=${response.userInterruptedAi}, was_interrupted_by_ai=${response.wasInterruptedByAi}`);

    lines.push("");
  }

  return lines;
}
