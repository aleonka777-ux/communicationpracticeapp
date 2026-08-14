import { EVALUATION_DIMENSIONS, type EvaluationDimension } from "@/lib/db/types";

export type DimensionScores = Record<EvaluationDimension, number>;

/** Pure score-delta math — deliberately not AI-generated, so it's always exactly accurate. */
export function computeScoreDeltas(current: DimensionScores, previous: DimensionScores): Partial<Record<EvaluationDimension, number>> {
  return EVALUATION_DIMENSIONS.reduce((acc, dim) => {
    acc[dim] = current[dim] - previous[dim];
    return acc;
  }, {} as Partial<Record<EvaluationDimension, number>>);
}
