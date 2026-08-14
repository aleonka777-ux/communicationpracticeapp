import { describe, expect, it } from "vitest";
import { computeRemainingSeconds } from "@/lib/practice/timer";

describe("computeRemainingSeconds", () => {
  it("returns the full duration right when the session starts", () => {
    const startedAt = new Date("2026-01-01T00:00:00.000Z").toISOString();
    const now = new Date("2026-01-01T00:00:00.000Z").getTime();
    expect(computeRemainingSeconds(startedAt, 180, now)).toBe(180);
  });

  it("counts down as time passes", () => {
    const startedAt = new Date("2026-01-01T00:00:00.000Z").toISOString();
    const now = new Date("2026-01-01T00:01:00.000Z").getTime();
    expect(computeRemainingSeconds(startedAt, 180, now)).toBe(120);
  });

  it("never goes below zero once time is up", () => {
    const startedAt = new Date("2026-01-01T00:00:00.000Z").toISOString();
    const now = new Date("2026-01-01T00:10:00.000Z").getTime();
    expect(computeRemainingSeconds(startedAt, 180, now)).toBe(0);
  });

  it("hits exactly zero at the duration boundary", () => {
    const startedAt = new Date("2026-01-01T00:00:00.000Z").toISOString();
    const now = new Date("2026-01-01T00:03:00.000Z").getTime();
    expect(computeRemainingSeconds(startedAt, 180, now)).toBe(0);
  });
});
