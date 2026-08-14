import { EVALUATION_DIMENSIONS, type EvaluationDimension, type EvaluationWeights } from "@/lib/db/types";

/** Merges a scenario's partial weight override over the tool's default weights, renormalized to sum to 1.0. */
export function mergeWeights(base: EvaluationWeights, override?: Partial<EvaluationWeights>): EvaluationWeights {
  if (!override || Object.keys(override).length === 0) return base;

  const merged = { ...base, ...override } as EvaluationWeights;
  const sum = EVALUATION_DIMENSIONS.reduce((acc, dim) => acc + merged[dim], 0);
  if (sum <= 0) return base;

  return EVALUATION_DIMENSIONS.reduce((acc, dim) => {
    acc[dim] = merged[dim] / sum;
    return acc;
  }, {} as EvaluationWeights);
}

export function weightedOverallScore(scores: Record<EvaluationDimension, number>, weights: EvaluationWeights): number {
  const raw = EVALUATION_DIMENSIONS.reduce((acc, dim) => acc + scores[dim] * weights[dim], 0);
  return Math.round(raw * 100) / 100;
}
