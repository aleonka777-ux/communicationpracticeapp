/**
 * Post-evaluation navigation, with a lifecycle-proven, injectable-timer watchdog — extracted from
 * realtime-simulation-client.tsx so both the "soft navigation stalls" detection and the "hard
 * navigation fallback" trigger are directly unit-testable, mirroring the same
 * injectable-setTimer/clearTimer pattern already used by src/lib/realtime/bargeIn.ts.
 *
 * Root cause investigated (see /docs/DECISIONS.md "Navigation-latency fix" for the full incident
 * writeup): production showed `/api/practice/end` succeeding, `router.push()` being called
 * immediately after, and the browser then sitting on "Wrapping up…" for ~8.4 seconds before the
 * feedback route actually rendered. Next.js App Router's `router.push()` returns void — it has no
 * completion promise — so this codebase already (correctly) treats this component's own UNMOUNT as
 * the proof navigation actually landed (see realtime-simulation-client.tsx's mount-effect cleanup,
 * which logs `navigation_completed` there, not right after `router.push()`). That detector was
 * verified correct, not the bug: a component only unmounts when React Router genuinely swaps in the
 * destination route's component tree.
 *
 * The actual ~8.4s came from the DESTINATION route re-doing unnecessary sequential work
 * (`src/app/(app)/practice/[sessionId]/feedback/page.tsx` previously awaited two independent
 * Supabase reads back-to-back instead of concurrently — fixed alongside this module) — not from
 * this navigation-recovery logic itself, which was and remains a correct safety net, not the cause.
 *
 * `NAVIGATION_STALL_TIMEOUT_MS` (8000) is unchanged by this investigation — no evidence here
 * justifies retuning it, only making its recovery action more useful (see `hardNavigate` below).
 *
 * This module is intentionally narrow: `softNavigate`/`hardNavigate`/`onStalled` are the ONLY
 * capabilities it is given. It cannot call `/api/practice/end` or any other mutation — there is no
 * such capability in its option type — so a stalled/fallback path can structurally never trigger a
 * duplicate practice finalization; `/api/practice/end` is separately, independently idempotent
 * (returns the existing evaluation immediately if one is already persisted for the session — see
 * src/app/api/practice/end/route.ts) as defense in depth, but this module doesn't even have the
 * means to call it.
 */

export const NAVIGATION_STALL_TIMEOUT_MS = 8000;

export interface NavigationRecoveryOptions {
  /** Next.js client-side navigation — e.g. `() => router.push(url)`. Called once, immediately, by `start()`. */
  softNavigate: () => void;
  /**
   * Full-page navigation fallback — e.g. `() => window.location.assign(url)`. Called automatically
   * once `timeoutMs` elapses without `cancel()` having been called — evaluation is already
   * confirmed persisted by the time this module is ever used (see the module doc comment), so a
   * fresh GET navigation to the same, already-ready destination is always safe to trigger without
   * asking the user first.
   */
  hardNavigate: () => void;
  /** UI-only signal (e.g. reveal a "we couldn't automatically open it" notice) — fired at the same
   *  moment as `hardNavigate`, so the user sees an honest explanation even though recovery is
   *  already automatic. */
  onStalled: () => void;
  /** Defaults to NAVIGATION_STALL_TIMEOUT_MS. Overridable for deterministic tests. */
  timeoutMs?: number;
  /** Injectable timer, real setTimeout/clearTimeout by default — overridable for deterministic tests. */
  setTimer?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (id: ReturnType<typeof setTimeout>) => void;
}

export interface NavigationRecovery {
  /** Performs the soft navigation once and arms the stall watchdog. */
  start(): void;
  /** Cancels the pending watchdog timer — call this the instant navigation is known to have
   *  succeeded (this component unmounting is that proof; see the module doc comment) or the
   *  session is ending for an unrelated reason. Safe to call more than once, and safe to call after
   *  the watchdog has already fired (a no-op either way). */
  cancel(): void;
}

export function createNavigationRecovery(options: NavigationRecoveryOptions): NavigationRecovery {
  const timeoutMs = options.timeoutMs ?? NAVIGATION_STALL_TIMEOUT_MS;
  const setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = options.clearTimer ?? ((id) => clearTimeout(id));

  let timer: ReturnType<typeof setTimeout> | null = null;

  return {
    start() {
      options.softNavigate();
      timer = setTimer(() => {
        timer = null;
        options.onStalled();
        options.hardNavigate();
      }, timeoutMs);
    },
    cancel() {
      if (timer !== null) {
        clearTimer(timer);
        timer = null;
      }
    },
  };
}
