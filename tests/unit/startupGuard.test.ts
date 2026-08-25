import { describe, expect, it } from "vitest";
import { computeStartupConfirmMs, STARTUP_FOLLOWUP_CONFIRM_MS, STARTUP_GRACE_MS } from "@/lib/realtime/startupGuard";

describe("computeStartupConfirmMs", () => {
  it("requires the full grace period plus the follow-up window right as AI audio starts (elapsed 0)", () => {
    expect(computeStartupConfirmMs(0)).toBe(STARTUP_GRACE_MS + STARTUP_FOLLOWUP_CONFIRM_MS);
  });

  it("treats null elapsed (audio-start timestamp not yet known) as the most conservative case, same as 0", () => {
    expect(computeStartupConfirmMs(null)).toBe(computeStartupConfirmMs(0));
  });

  it("shrinks smoothly as more time passes since AI audio started", () => {
    const early = computeStartupConfirmMs(100);
    const later = computeStartupConfirmMs(500);
    expect(later).toBeLessThan(early);
    expect(computeStartupConfirmMs(500)).toBe(STARTUP_GRACE_MS - 500 + STARTUP_FOLLOWUP_CONFIRM_MS);
  });

  it("collapses to exactly the follow-up window once the grace period has fully elapsed", () => {
    expect(computeStartupConfirmMs(STARTUP_GRACE_MS)).toBe(STARTUP_FOLLOWUP_CONFIRM_MS);
    expect(computeStartupConfirmMs(STARTUP_GRACE_MS + 5000)).toBe(STARTUP_FOLLOWUP_CONFIRM_MS);
  });

  it("never goes negative or below the follow-up window, however far past grace", () => {
    expect(computeStartupConfirmMs(1_000_000)).toBe(STARTUP_FOLLOWUP_CONFIRM_MS);
  });

  it("respects custom grace/follow-up parameters", () => {
    expect(computeStartupConfirmMs(0, 2000, 300)).toBe(2300);
    expect(computeStartupConfirmMs(2000, 2000, 300)).toBe(300);
  });
});
