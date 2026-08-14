import { EVALUATION_DIMENSIONS, type EvaluationDimension, type EvaluationWeights, type MethodStep } from "@/lib/db/types";

export function parseLines(formData: FormData, key: string): string[] {
  const raw = String(formData.get(key) ?? "");
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** Parses lines shaped "Step title: description" into structured steps. A line with no colon becomes a step with an empty description. */
export function parseSteps(formData: FormData, key: string): MethodStep[] {
  return parseLines(formData, key).map((line) => {
    const idx = line.indexOf(":");
    if (idx === -1) return { step: line, description: "" };
    return { step: line.slice(0, idx).trim(), description: line.slice(idx + 1).trim() };
  });
}

export function stepsToLines(steps: MethodStep[]): string {
  return steps.map((s) => (s.description ? `${s.step}: ${s.description}` : s.step)).join("\n");
}

function buildWeights(values: (dim: EvaluationDimension) => number): EvaluationWeights {
  return EVALUATION_DIMENSIONS.reduce((acc, dim) => {
    acc[dim] = values(dim);
    return acc;
  }, {} as EvaluationWeights);
}

/** Reads six `${prefix}${dimension}` number fields and renormalizes them to sum to 1.0. */
export function parseWeights(formData: FormData, prefix: string): EvaluationWeights {
  const raw = buildWeights((dim) => Number(formData.get(`${prefix}${dim}`) ?? 0));

  const sum = EVALUATION_DIMENSIONS.reduce((acc, dim) => acc + (Number.isFinite(raw[dim]) ? raw[dim] : 0), 0);
  if (sum <= 0) {
    const equal = 1 / EVALUATION_DIMENSIONS.length;
    return buildWeights(() => equal);
  }

  return buildWeights((dim) => Math.round(((raw[dim] || 0) / sum) * 1000) / 1000);
}

/** Like parseWeights but returns undefined for any dimension left blank, and undefined entirely if nothing was provided (no override). */
export function parseOptionalWeights(formData: FormData, prefix: string): Partial<EvaluationWeights> | undefined {
  const entries: [EvaluationDimension, number][] = [];
  for (const dim of EVALUATION_DIMENSIONS) {
    const raw = formData.get(`${prefix}${dim}`);
    if (raw === null || String(raw).trim() === "") continue;
    const num = Number(raw);
    if (Number.isFinite(num)) entries.push([dim, num]);
  }
  if (entries.length === 0) return undefined;
  return Object.fromEntries(entries) as Partial<EvaluationWeights>;
}

export function parseCriteria(formData: FormData, prefix: string): Partial<Record<EvaluationDimension, string>> {
  const result: Partial<Record<EvaluationDimension, string>> = {};
  for (const dim of EVALUATION_DIMENSIONS) {
    const value = String(formData.get(`${prefix}${dim}`) ?? "").trim();
    if (value) result[dim] = value;
  }
  return result;
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
