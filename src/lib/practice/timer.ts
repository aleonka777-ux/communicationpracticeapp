/** Pure countdown math, extracted for testability (see /docs/BUILD_PLAN.md testing checklist). */
export function computeRemainingSeconds(startedAtIso: string, durationSeconds: number, now: number = Date.now()): number {
  const endTime = new Date(startedAtIso).getTime() + durationSeconds * 1000;
  return Math.max(0, Math.round((endTime - now) / 1000));
}
