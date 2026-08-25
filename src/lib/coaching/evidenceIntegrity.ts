import type { EvaluationLLMOutput } from "@/lib/coaching/schema";

/**
 * Whether this evaluation has access to any vocal/paralinguistic evidence (tone, pace, pauses,
 * volume, timing, etc.) beyond the plain text transcript. No such pipeline exists yet — Realtime
 * voice (src/lib/realtime) captures audio only to let the interlocutor speak and listen, it never
 * measures or persists vocal metrics — so this is always false today. Kept as an explicit named
 * capability, rather than an unstated assumption baked into the prompt, so a future vocal-metrics
 * feature has exactly one place to flip it (and a validation step that respects it — see below).
 */
export const VOCAL_EVIDENCE_AVAILABLE = false;

export interface ParalinguisticViolation {
  /** Dot/bracket path into the evaluation output, e.g. "dimensions.non_escalation.evidence". */
  field: string;
  /** Which banned concept matched — never the matched sentence itself (may quote the transcript). */
  concept: string;
}

/**
 * Patterns for claims that imply the coach perceived something about HOW the user sounded,
 * rather than what they said — the exact failure mode seen in production twice now ("maintained a
 * calm demeanor", "didn't raise their voice", "maintained a respectful tone"). Deliberately does
 * NOT ban the bare word "emotion" — acknowledging the OTHER person's stated emotion in words
 * ("I can see you're frustrated") is legitimate, desired, transcript-based content central to
 * several tools' own methodology; only a claim about perceived emotional/vocal STATE is banned.
 */
const PARALINGUISTIC_PATTERNS: { pattern: RegExp; concept: string }[] = [
  { pattern: /\btone\b/i, concept: "tone" },
  { pattern: /\bdemeanor\b/i, concept: "demeanor" },
  { pattern: /\bcalm(ly|ness)?\b/i, concept: "calm" },
  { pattern: /\bvocal\b/i, concept: "vocal" },
  { pattern: /\bvoice\b/i, concept: "voice" },
  { pattern: /\bvolume\b/i, concept: "volume" },
  { pattern: /\bpace\b/i, concept: "pace" },
  { pattern: /\bpaus(e|es|ed|ing)\b/i, concept: "pauses" },
  { pattern: /\bhesitat\w*/i, concept: "hesitation" },
  { pattern: /\bemotional state\b/i, concept: "emotional state" },
  { pattern: /\bsounded\s+\w+/i, concept: "sounded <adjective>" },
];

function fieldsToScan(output: EvaluationLLMOutput): Array<[string, string]> {
  const fields: Array<[string, string]> = [["overall_summary", output.overall_summary]];

  for (const [dim, d] of Object.entries(output.dimensions)) {
    fields.push([`dimensions.${dim}.evidence`, d.evidence]);
    fields.push([`dimensions.${dim}.explanation`, d.explanation]);
  }

  output.strengths.forEach((s, i) => {
    fields.push([`strengths[${i}].point`, s.point]);
    fields.push([`strengths[${i}].evidence`, s.evidence]);
  });

  output.improvement_areas.forEach((a, i) => {
    fields.push([`improvement_areas[${i}].issue`, a.issue]);
    fields.push([`improvement_areas[${i}].why_it_matters`, a.why_it_matters]);
    fields.push([`improvement_areas[${i}].suggestion`, a.suggestion]);
    fields.push([`improvement_areas[${i}].example`, a.example]);
  });

  fields.push(["next_focus", output.next_focus]);
  output.comparison_notes.forEach((note, i) => fields.push([`comparison_notes[${i}]`, note]));

  return fields;
}

/** Returns the first paralinguistic/audio claim found in the evaluation output, or null if clean. */
export function findParalinguisticViolation(output: EvaluationLLMOutput): ParalinguisticViolation | null {
  for (const [field, text] of fieldsToScan(output)) {
    for (const { pattern, concept } of PARALINGUISTIC_PATTERNS) {
      if (pattern.test(text)) {
        return { field, concept };
      }
    }
  }
  return null;
}
