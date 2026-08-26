/**
 * Pure, transcript-text-only detection of filler/disfluency CANDIDATES — Phase 4A evidence
 * collection. Deliberately produces candidates, never judgments: a matched token is recorded with
 * position + surrounding context so a later methodology layer (Phase 4B, not built here) can decide
 * whether it was a genuine filler, a discourse marker, an active-listening cue, or ordinary semantic
 * content. See /docs/DECISIONS.md "Phase 4A: speech-delivery evidence" for the full audit this is
 * built from.
 *
 * Reliability is NOT uniform across the two categories, and callers must not treat them as equally
 * trustworthy:
 *
 * - `vocal_disfluency_candidate` (uh, um, erm, hmm/mmm): BEST-EFFORT, UNDERCOUNT-ONLY. This app's
 *   Realtime transcription uses OpenAI's `whisper-1` (see src/lib/realtime/session.ts), and
 *   Whisper-family models are trained toward fluent, clean output — they are well-established to
 *   inconsistently smooth over or omit short interjections like these. If a token appears in the
 *   transcript, it is reasonable (if not certain) evidence it was actually said; if it does NOT
 *   appear, that is NOT evidence it wasn't said — the model may have silently dropped it. Any
 *   aggregate built from this category is therefore a floor, never a true incidence count.
 * - `lexical_discourse_candidate` (like, well, you know, so, actually, basically, I mean, kind of,
 *   sort of): more reliable — these are ordinary content words that survive Whisper's disfluency
 *   smoothing the same way any other word would (a mistranscription risk exists for any word, but
 *   it isn't the SYSTEMATIC filler-specific dropping described above). Still, a word is not
 *   automatically a filler in context ("It looks like a good solution" — semantic; "Do you know
 *   when the meeting starts?" — semantic) — this module never attempts that disambiguation. Every
 *   match is `classification: "unclassified"`, always, with enough surrounding text preserved for a
 *   future contextual pass to decide.
 * - `repetition_candidate` (immediate word repetition, e.g. "I I think"): reliable independent of
 *   Whisper's filler-smoothing behavior — a repeated real word survives normalization the same as
 *   any other word. Does NOT attempt to detect abandoned phrases/false starts beyond this — that
 *   would require punctuation/disfluency cues (dashes, restarts) that are not reliably or
 *   consistently emitted by the current transcription pipeline, so it is not implemented; see the
 *   module's own doc comment in sessionTimeline.ts for the explicit limitation note.
 */

export type FillerCandidateCategory = "vocal_disfluency_candidate" | "lexical_discourse_candidate" | "repetition_candidate";

export interface FillerCandidate {
  phrase: string;
  category: FillerCandidateCategory;
  /** Always "unclassified" today — Phase 4B, not built here, will add real classifications. */
  classification: "unclassified";
  /** Character offsets into the turn's own transcript string — a real, verifiable position. */
  transcriptStartChar: number;
  transcriptEndChar: number;
  /** Short surrounding text, preserved so a later contextual pass can classify the match without
   *  needing to re-fetch the full transcript. Trimmed to CONTEXT_WINDOW_CHARS on each side. */
  contextBefore: string;
  contextAfter: string;
}

const CONTEXT_WINDOW_CHARS = 24;

/** Undercount-only — see the module doc comment. Matches uh/um/erm/hmm/mmm and short repeated
 *  vowel/consonant variants (e.g. "ummm") a transcriber occasionally preserves. */
const VOCAL_DISFLUENCY_PATTERN = /\b(u+h+|u+m+|e+r+m+|h+m+|m+m+)\b/gi;

/** Checked as whole phrases before single words so "you know" is captured once, not as two
 *  separate single-word matches. */
const LEXICAL_DISCOURSE_PHRASES = ["you know", "i mean", "kind of", "sort of"];
const LEXICAL_DISCOURSE_WORDS = ["like", "well", "so", "actually", "basically"];

/** Immediate repetition of the same word (case-insensitive), e.g. "I I think" or "the the report". */
const REPETITION_PATTERN = /\b(\w+)([ \t]+)\1\b/gi;

function contextWindow(transcript: string, start: number, end: number): { before: string; after: string } {
  return {
    before: transcript.slice(Math.max(0, start - CONTEXT_WINDOW_CHARS), start),
    after: transcript.slice(end, Math.min(transcript.length, end + CONTEXT_WINDOW_CHARS)),
  };
}

function buildCandidate(
  transcript: string,
  phrase: string,
  category: FillerCandidateCategory,
  start: number,
  end: number,
): FillerCandidate {
  const { before, after } = contextWindow(transcript, start, end);
  return {
    phrase,
    category,
    classification: "unclassified",
    transcriptStartChar: start,
    transcriptEndChar: end,
    contextBefore: before,
    contextAfter: after,
  };
}

/** Runs a global regex over the transcript, returning non-overlapping [start, end) matches. */
function findMatches(transcript: string, pattern: RegExp): Array<{ start: number; end: number; text: string }> {
  const matches: Array<{ start: number; end: number; text: string }> = [];
  for (const m of transcript.matchAll(pattern)) {
    if (m.index === undefined) continue;
    matches.push({ start: m.index, end: m.index + m[0].length, text: m[0] });
  }
  return matches;
}

function rangesOverlap(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  return a.start < b.end && b.start < a.end;
}

/**
 * Detects filler/disfluency candidates in one user turn's final transcript text. Pure and
 * synchronous — no audio, no timing, no I/O — so it is directly unit-testable against plain
 * strings. Position/timing within the SESSION (not just the transcript string) is layered on by the
 * caller (sessionTimeline.ts), which knows the turn's startMs/endMs; this module only ever reports
 * transcript-relative character offsets.
 */
export function detectFillerCandidates(transcript: string): FillerCandidate[] {
  if (!transcript.trim()) return [];

  const claimed: Array<{ start: number; end: number }> = [];
  const candidates: FillerCandidate[] = [];

  function addAll(matches: Array<{ start: number; end: number; text: string }>, category: FillerCandidateCategory) {
    for (const m of matches) {
      if (claimed.some((c) => rangesOverlap(c, m))) continue; // avoid double-counting the same span
      claimed.push({ start: m.start, end: m.end });
      candidates.push(buildCandidate(transcript, m.text, category, m.start, m.end));
    }
  }

  // Repetition first — "well well" should be reported as a repetition, not a second lexical hit.
  addAll(findMatches(transcript, REPETITION_PATTERN), "repetition_candidate");
  addAll(findMatches(transcript, VOCAL_DISFLUENCY_PATTERN), "vocal_disfluency_candidate");

  // Multi-word discourse phrases before single words, so "you know" isn't also split into a
  // (nonexistent, since "know" isn't a candidate word) partial match — kept for future-proofing if
  // the single-word list ever grows to overlap a phrase's constituent words.
  for (const phrase of LEXICAL_DISCOURSE_PHRASES) {
    const pattern = new RegExp(`\\b${phrase.replace(/ /g, "\\s+")}\\b`, "gi");
    addAll(findMatches(transcript, pattern), "lexical_discourse_candidate");
  }
  for (const word of LEXICAL_DISCOURSE_WORDS) {
    const pattern = new RegExp(`\\b${word}\\b`, "gi");
    addAll(findMatches(transcript, pattern), "lexical_discourse_candidate");
  }

  candidates.sort((a, b) => a.transcriptStartChar - b.transcriptStartChar);
  return candidates;
}
