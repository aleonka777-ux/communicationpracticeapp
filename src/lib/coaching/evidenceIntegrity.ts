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

export interface SanitizedFieldLogEntry extends ParalinguisticViolation {
  /** "phrase_rewrite": the offending phrase was replaced in place, meaning preserved.
   *  "neutral_fallback": no safe rewrite existed, so the whole field became a generic statement. */
  method: "phrase_rewrite" | "neutral_fallback";
}

/**
 * Patterns for claims that imply the coach perceived something about HOW the user sounded,
 * rather than what they said — the exact failure mode seen in production ("maintained a calm
 * demeanor", "didn't raise their voice", "maintained a respectful tone"). Deliberately does NOT
 * ban the bare word "emotion" — acknowledging the OTHER person's stated emotion in words ("I can
 * see you're frustrated") is legitimate, desired, transcript-based content central to several
 * tools' own methodology; only a claim about perceived emotional/vocal STATE is banned.
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

/** Returns the first banned concept found in a single string, or null if it's clean. */
function textViolation(text: string): string | null {
  for (const { pattern, concept } of PARALINGUISTIC_PATTERNS) {
    if (pattern.test(text)) return concept;
  }
  return null;
}

/**
 * Idiomatic, meaning-preserving rewrites, most specific first — each operates on the output of
 * the ones before it, so a specific match (e.g. "respectful tone") is handled before the generic
 * fallback for the same concept (e.g. bare "tone") ever sees it. Deliberately does not attempt to
 * cover every concept: hesitation, "emotional state," and an unrecognized "sounded <adjective>"
 * have no safe direct wording substitute without risking an inverted or invented meaning, so
 * those are left to the neutral whole-field fallback in sanitizeEvaluationOutput instead.
 */
const PHRASE_REWRITES: { pattern: RegExp; replace: (...match: string[]) => string }[] = [
  { pattern: /\bdid(?:n['’]?t| not) raise (?:their|your|his|her) voice\b/gi, replace: () => "did not use hostile or escalating language" },
  { pattern: /\bwithout raising (?:their|your|his|her) voice\b/gi, replace: () => "without using hostile or escalating language" },
  { pattern: /\bsounded confident\b/gi, replace: () => "stated their position directly" },
  { pattern: /\bsounded calm\b/gi, replace: () => "used non-escalatory wording" },
  { pattern: /\bcalm(?:ly)? tone\b/gi, replace: () => "non-escalatory language" },
  { pattern: /\bcalm demeanor\b/gi, replace: () => "non-escalatory language" },
  { pattern: /\brespectful tone\b/gi, replace: () => "respectful wording" },
  { pattern: /\b(\w+) tone\b/gi, replace: (_m, adjective) => `${adjective} wording` },
  { pattern: /\bvoice\b/gi, replace: () => "wording" },
  { pattern: /\btone\b/gi, replace: () => "wording" },
  { pattern: /\bdemeanor\b/gi, replace: () => "wording" },
  { pattern: /\bcalm(?:ly|ness)?\b/gi, replace: () => "non-escalatory" },
  { pattern: /\bvocal\b/gi, replace: () => "verbal" },
  { pattern: /\bvolume\b/gi, replace: () => "wording" },
  { pattern: /\bpace\b/gi, replace: () => "wording" },
];

/** Applies the known safe rewrites to one string. May still contain a violation — caller re-checks. */
export function sanitizeParalinguisticText(text: string): string {
  let result = text;
  for (const { pattern, replace } of PHRASE_REWRITES) {
    result = result.replace(pattern, replace as unknown as (substring: string, ...groups: string[]) => string);
  }
  return result;
}

const FIELD_MAX_LENGTH: { suffix: string; max: number }[] = [
  { suffix: "overall_summary", max: 800 },
  { suffix: ".evidence", max: 400 },
  { suffix: ".explanation", max: 400 },
];

function maxLengthFor(path: string): number {
  const matched = FIELD_MAX_LENGTH.find((f) => path === f.suffix || path.endsWith(f.suffix));
  return matched?.max ?? 300; // point/issue/why_it_matters/suggestion/example/next_focus/comparison_notes
}

/** A short, always-safe, transcript-grounded statement for a field that couldn't be rewritten in place. */
function neutralFallbackFor(path: string): string {
  if (path === "overall_summary") return "This evaluation is based on the wording used in the transcript.";
  if (path.endsWith(".evidence")) return "See the transcript for the specific wording behind this score.";
  if (path.endsWith(".explanation")) return "This reflects the wording used, not any assumed delivery.";
  if (path.endsWith(".point")) return "Used clear, direct wording.";
  if (path.endsWith(".issue")) return "Some wording choices could be more effective.";
  if (path.endsWith(".why_it_matters")) return "Clearer wording helps the other person follow the point.";
  if (path.endsWith(".suggestion")) return "Consider rephrasing this part of the response.";
  if (path.endsWith(".example")) return "";
  if (path === "next_focus") return "Focus on the specific wording used in the next attempt.";
  if (path.startsWith("comparison_notes")) return "No specific wording comparison is available for this dimension.";
  return "Based on the wording used in the transcript.";
}

interface FieldRef {
  path: string;
  get: () => string;
  set: (value: string) => void;
}

/** Every rewritable text field in the evaluation output, as get/set pairs over a single object —
 *  shared by violation scanning and sanitization so the two can never drift out of sync. */
function fieldRefs(output: EvaluationLLMOutput): FieldRef[] {
  const refs: FieldRef[] = [
    { path: "overall_summary", get: () => output.overall_summary, set: (v) => (output.overall_summary = v) },
  ];

  (Object.keys(output.dimensions) as (keyof EvaluationLLMOutput["dimensions"])[]).forEach((dim) => {
    const d = output.dimensions[dim];
    refs.push({ path: `dimensions.${dim}.evidence`, get: () => d.evidence, set: (v) => (d.evidence = v) });
    refs.push({ path: `dimensions.${dim}.explanation`, get: () => d.explanation, set: (v) => (d.explanation = v) });
  });

  output.strengths.forEach((s, i) => {
    refs.push({ path: `strengths[${i}].point`, get: () => s.point, set: (v) => (s.point = v) });
    refs.push({ path: `strengths[${i}].evidence`, get: () => s.evidence, set: (v) => (s.evidence = v) });
  });

  output.improvement_areas.forEach((a, i) => {
    refs.push({ path: `improvement_areas[${i}].issue`, get: () => a.issue, set: (v) => (a.issue = v) });
    refs.push({ path: `improvement_areas[${i}].why_it_matters`, get: () => a.why_it_matters, set: (v) => (a.why_it_matters = v) });
    refs.push({ path: `improvement_areas[${i}].suggestion`, get: () => a.suggestion, set: (v) => (a.suggestion = v) });
    refs.push({ path: `improvement_areas[${i}].example`, get: () => a.example, set: (v) => (a.example = v) });
  });

  refs.push({ path: "next_focus", get: () => output.next_focus, set: (v) => (output.next_focus = v) });
  output.comparison_notes.forEach((_note, i) => {
    refs.push({
      path: `comparison_notes[${i}]`,
      get: () => output.comparison_notes[i],
      set: (v) => (output.comparison_notes[i] = v),
    });
  });

  return refs;
}

/** Returns the first paralinguistic/audio claim found in the evaluation output, or null if clean. */
export function findParalinguisticViolation(output: EvaluationLLMOutput): ParalinguisticViolation | null {
  for (const ref of fieldRefs(output)) {
    const concept = textViolation(ref.get());
    if (concept) return { field: ref.path, concept };
  }
  return null;
}

/** Every paralinguistic/audio claim found in the evaluation output — used to sanitize all of them, not just the first. */
export function findAllParalinguisticViolations(output: EvaluationLLMOutput): ParalinguisticViolation[] {
  const violations: ParalinguisticViolation[] = [];
  for (const ref of fieldRefs(output)) {
    const concept = textViolation(ref.get());
    if (concept) violations.push({ field: ref.path, concept });
  }
  return violations;
}

/**
 * Last-resort recovery once regeneration has already been tried and a violation remains: rewrite
 * only the affected field(s) rather than rejecting the whole evaluation (see /docs/DECISIONS.md —
 * a single bad field must never cost the user their entire feedback report). Mutates and returns
 * the same object; every field is independently either rewritten in place (meaning preserved) or,
 * if no safe rewrite exists, replaced with a short neutral transcript-grounded statement — never
 * left violating.
 */
export function sanitizeEvaluationOutput(output: EvaluationLLMOutput): {
  output: EvaluationLLMOutput;
  sanitized: SanitizedFieldLogEntry[];
} {
  const sanitized: SanitizedFieldLogEntry[] = [];

  for (const ref of fieldRefs(output)) {
    const original = ref.get();
    const concept = textViolation(original);
    if (!concept) continue;

    const rewritten = sanitizeParalinguisticText(original);
    const rewriteIsClean = textViolation(rewritten) === null;
    const rewriteFits = rewritten.length <= maxLengthFor(ref.path);

    if (rewriteIsClean && rewriteFits) {
      ref.set(rewritten);
      sanitized.push({ field: ref.path, concept, method: "phrase_rewrite" });
    } else {
      ref.set(neutralFallbackFor(ref.path));
      sanitized.push({ field: ref.path, concept, method: "neutral_fallback" });
    }
  }

  return { output, sanitized };
}
