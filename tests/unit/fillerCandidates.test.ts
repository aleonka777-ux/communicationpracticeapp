import { describe, expect, it } from "vitest";
import { detectFillerCandidates } from "@/lib/realtime/fillerCandidates";

describe("detectFillerCandidates", () => {
  it("returns nothing for an empty or whitespace-only transcript", () => {
    expect(detectFillerCandidates("")).toEqual([]);
    expect(detectFillerCandidates("   ")).toEqual([]);
  });

  it("detects a clearly vocal disfluency candidate (um) as unclassified", () => {
    const candidates = detectFillerCandidates("I um think that works.");
    expect(candidates).toHaveLength(1);
    expect(candidates[0].phrase.toLowerCase()).toBe("um");
    expect(candidates[0].category).toBe("vocal_disfluency_candidate");
    expect(candidates[0].classification).toBe("unclassified");
  });

  it("detects uh/erm/hmm as vocal disfluency candidates too", () => {
    const candidates = detectFillerCandidates("uh well erm hmm okay");
    const categories = candidates.map((c) => c.category);
    expect(categories.filter((c) => c === "vocal_disfluency_candidate").length).toBeGreaterThanOrEqual(3);
  });

  it("stores a lexical candidate (like) as unclassified — never automatically labeled a filler", () => {
    const candidates = detectFillerCandidates("It was, like, really surprising.");
    const likeCandidate = candidates.find((c) => c.phrase.toLowerCase() === "like");
    expect(likeCandidate).toBeDefined();
    expect(likeCandidate?.category).toBe("lexical_discourse_candidate");
    expect(likeCandidate?.classification).toBe("unclassified");
  });

  it("does NOT prove a semantic 'like' is a filler — still just an unclassified candidate with context preserved", () => {
    // "like" used semantically ("similar to"), not as a discourse filler.
    const candidates = detectFillerCandidates("It looks like a good solution.");
    const likeCandidate = candidates.find((c) => c.phrase.toLowerCase() === "like");
    expect(likeCandidate).toBeDefined();
    // The module makes NO semantic judgment — it is still just "unclassified", with context
    // preserved for a later contextual pass to disambiguate. It must not claim "filler" anywhere.
    expect(likeCandidate?.classification).toBe("unclassified");
    expect(likeCandidate?.contextBefore.length).toBeGreaterThan(0);
  });

  it("does not treat an active-listening 'mm-hm' acknowledgement as a filler beyond an unclassified candidate", () => {
    const candidates = detectFillerCandidates("Mm-hm, I understand.");
    // "Mm" matches the vocal disfluency pattern (hmm/mmm family) but is captured only as an
    // unclassified candidate — this module never claims it IS a filler versus an acknowledgement.
    for (const c of candidates) {
      expect(c.classification).toBe("unclassified");
    }
  });

  it("captures you know / I mean / kind of / sort of as lexical discourse candidates", () => {
    const candidates = detectFillerCandidates("You know, I mean, it was kind of sort of unexpected.");
    const phrases = candidates.filter((c) => c.category === "lexical_discourse_candidate").map((c) => c.phrase.toLowerCase());
    expect(phrases).toContain("you know");
    expect(phrases).toContain("i mean");
    expect(phrases).toContain("kind of");
    expect(phrases).toContain("sort of");
  });

  it("detects immediate word repetition as a repetition_candidate", () => {
    const candidates = detectFillerCandidates("I I think the the report is ready.");
    const repetitions = candidates.filter((c) => c.category === "repetition_candidate");
    expect(repetitions.length).toBe(2);
    expect(repetitions.map((r) => r.phrase.toLowerCase())).toEqual(expect.arrayContaining(["i i", "the the"]));
  });

  it("preserves transcript-relative character position and surrounding context", () => {
    const transcript = "Well, I think we should proceed.";
    const candidates = detectFillerCandidates(transcript);
    const well = candidates.find((c) => c.phrase.toLowerCase() === "well");
    expect(well).toBeDefined();
    expect(transcript.slice(well!.transcriptStartChar, well!.transcriptEndChar).toLowerCase()).toBe("well");
  });

  it("never double-counts the same span across categories", () => {
    // "well well" should be a repetition, not also two separate lexical "well" hits.
    const candidates = detectFillerCandidates("Well well, that is unexpected.");
    const repetition = candidates.filter((c) => c.category === "repetition_candidate");
    const lexicalWell = candidates.filter((c) => c.category === "lexical_discourse_candidate" && c.phrase.toLowerCase().includes("well"));
    expect(repetition.length).toBe(1);
    expect(lexicalWell.length).toBe(0);
  });

  it("returns candidates sorted by position in the transcript", () => {
    const candidates = detectFillerCandidates("So, um, I think, well, that works.");
    const positions = candidates.map((c) => c.transcriptStartChar);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });
});
