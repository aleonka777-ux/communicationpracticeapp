import { describe, expect, it } from "vitest";
import { isStageBAllowedTransition, MANUAL_LIFECYCLE_STATUSES } from "@/lib/manual/lifecycle";

describe("Stage B lifecycle transition rules", () => {
  it("all five lifecycle statuses are represented", () => {
    expect(MANUAL_LIFECYCLE_STATUSES).toEqual(["draft", "parsed", "validated", "active", "archived"]);
  });

  it("allows draft -> parsed", () => {
    expect(isStageBAllowedTransition("draft", "parsed")).toBe(true);
  });

  it("allows re-parsing an already-parsed version (parsed -> parsed)", () => {
    expect(isStageBAllowedTransition("parsed", "parsed")).toBe(true);
  });

  it("rejects every transition into validated/active/archived in this stage", () => {
    for (const from of MANUAL_LIFECYCLE_STATUSES) {
      expect(isStageBAllowedTransition(from, "validated")).toBe(false);
      expect(isStageBAllowedTransition(from, "active")).toBe(false);
      expect(isStageBAllowedTransition(from, "archived")).toBe(false);
    }
  });

  it("rejects parsing from validated/active/archived", () => {
    expect(isStageBAllowedTransition("validated", "parsed")).toBe(false);
    expect(isStageBAllowedTransition("active", "parsed")).toBe(false);
    expect(isStageBAllowedTransition("archived", "parsed")).toBe(false);
  });

  it("rejects draft -> draft (parsing always moves forward)", () => {
    expect(isStageBAllowedTransition("draft", "draft")).toBe(false);
  });
});
