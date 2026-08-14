import { describe, expect, it } from "vitest";
import { parseCriteria, parseLines, parseOptionalWeights, parseSteps, parseWeights, slugify, stepsToLines } from "@/lib/admin/forms";
import { EVALUATION_DIMENSIONS } from "@/lib/db/types";

function formData(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) fd.set(key, value);
  return fd;
}

describe("parseLines", () => {
  it("splits on newlines, trims, and drops blank lines", () => {
    expect(parseLines(formData({ a: "one\n  two  \n\nthree\n" }), "a")).toEqual(["one", "two", "three"]);
  });

  it("returns an empty array for a missing field", () => {
    expect(parseLines(formData({}), "missing")).toEqual([]);
  });
});

describe("parseSteps / stepsToLines round-trip", () => {
  it("parses 'Step: description' lines", () => {
    const steps = parseSteps(formData({ steps: "Acknowledge: name the concern\nClarify: ask a question" }), "steps");
    expect(steps).toEqual([
      { step: "Acknowledge", description: "name the concern" },
      { step: "Clarify", description: "ask a question" },
    ]);
  });

  it("treats a line with no colon as a step with empty description", () => {
    expect(parseSteps(formData({ steps: "Just a step" }), "steps")).toEqual([{ step: "Just a step", description: "" }]);
  });

  it("round-trips through stepsToLines", () => {
    const original = [{ step: "A", description: "b" }, { step: "C", description: "" }];
    const lines = stepsToLines(original);
    const reparsed = parseSteps(formData({ steps: lines }), "steps");
    expect(reparsed).toEqual(original);
  });
});

describe("parseWeights", () => {
  it("normalizes six weights to sum to 1", () => {
    const fd = formData(Object.fromEntries(EVALUATION_DIMENSIONS.map((d) => [`weight_${d}`, "2"])));
    const weights = parseWeights(fd, "weight_");
    const sum = Object.values(weights).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 2);
    expect(weights.clarity).toBeCloseTo(1 / 6, 2);
  });

  it("falls back to equal weights when everything is zero or blank", () => {
    const weights = parseWeights(formData({}), "weight_");
    const sum = Object.values(weights).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 5);
  });
});

describe("parseOptionalWeights", () => {
  it("returns undefined when no weight fields are provided", () => {
    expect(parseOptionalWeights(formData({}), "weight_")).toBeUndefined();
  });

  it("returns only the dimensions that were actually filled in", () => {
    const result = parseOptionalWeights(formData({ weight_clarity: "0.5" }), "weight_");
    expect(result).toEqual({ clarity: 0.5 });
  });
});

describe("parseCriteria", () => {
  it("only includes non-empty dimension guidance", () => {
    const fd = formData({ criteria_clarity: "Be clear", criteria_technique: "  " });
    expect(parseCriteria(fd, "criteria_")).toEqual({ clarity: "Be clear" });
  });
});

describe("slugify", () => {
  it("lowercases, replaces non-alphanumerics with hyphens, and trims edge hyphens", () => {
    expect(slugify("Setting a Boundary!")).toBe("setting-a-boundary");
    expect(slugify("  Multiple   Spaces  ")).toBe("multiple-spaces");
    expect(slugify("Already-Slugged")).toBe("already-slugged");
  });
});
