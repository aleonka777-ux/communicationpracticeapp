/**
 * Manual version lifecycle: draft -> parsed -> validated -> active -> archived.
 *
 * Stage B ("Versioned Communication Manual Infrastructure") only implements the
 * draft -> parsed transition. validated/active/archived are real, supported
 * database states (so future stages don't need a schema migration to exist),
 * but nothing in this stage may transition a version into them — that requires
 * methodology/evaluator validation that does not exist yet. See CLAUDE.md and
 * /docs/DECISIONS.md for why "parsed" must never be conflated with "validated".
 */

export const MANUAL_LIFECYCLE_STATUSES = ["draft", "parsed", "validated", "active", "archived"] as const;
export type ManualLifecycleStatus = (typeof MANUAL_LIFECYCLE_STATUSES)[number];

/** Transitions this stage of the application is allowed to perform. */
const STAGE_B_ALLOWED_TRANSITIONS: ReadonlyArray<readonly [ManualLifecycleStatus, ManualLifecycleStatus]> = [
  ["draft", "parsed"],
  // Re-parsing an already-parsed version (retry / re-upload of corrected source) stays in `parsed`.
  ["parsed", "parsed"],
];

export function isStageBAllowedTransition(from: ManualLifecycleStatus, to: ManualLifecycleStatus): boolean {
  return STAGE_B_ALLOWED_TRANSITIONS.some(([f, t]) => f === from && t === to);
}
