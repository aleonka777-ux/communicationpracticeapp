import type { SessionStatus } from "@/lib/db/types";

/**
 * Pure, DB-free attempt-numbering and previous-attempt-selection logic. Kept separate from
 * src/lib/db/sessions.ts so it can be unit tested without a database (see tests/unit/attempts.test.ts).
 */

export function computeNextAttemptNumber(existingAttemptNumbers: number[]): number {
  if (existingAttemptNumbers.length === 0) return 1;
  return Math.max(...existingAttemptNumbers) + 1;
}

export interface AttemptRef {
  attemptNumber: number;
  status: SessionStatus;
}

/**
 * The most recent *completed* attempt strictly before `currentAttemptNumber`, or null if there
 * isn't one. Abandoned/in-progress attempts are never used as a comparison baseline.
 */
export function selectPreviousAttempt<T extends AttemptRef>(attempts: T[], currentAttemptNumber: number): T | null {
  const eligible = attempts.filter((a) => a.status === "completed" && a.attemptNumber < currentAttemptNumber);
  if (eligible.length === 0) return null;
  return eligible.reduce((latest, a) => (a.attemptNumber > latest.attemptNumber ? a : latest));
}
