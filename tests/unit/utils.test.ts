import { describe, expect, it } from "vitest";
import { formatDuration } from "@/lib/utils";

describe("formatDuration", () => {
  it("formats whole minutes", () => {
    expect(formatDuration(180)).toBe("3:00");
    expect(formatDuration(120)).toBe("2:00");
  });

  it("pads seconds under 10", () => {
    expect(formatDuration(65)).toBe("1:05");
  });

  it("formats zero", () => {
    expect(formatDuration(0)).toBe("0:00");
  });
});
