import { describe, expect, it } from "vitest";
import { computeNextAttemptNumber, selectPreviousAttempt } from "@/lib/practice/attempts";

describe("computeNextAttemptNumber", () => {
  it("returns 1 for a brand new scenario", () => {
    expect(computeNextAttemptNumber([])).toBe(1);
  });

  it("increments from the highest existing attempt number", () => {
    expect(computeNextAttemptNumber([1, 2, 3])).toBe(4);
  });

  it("is robust to out-of-order or gappy attempt numbers", () => {
    expect(computeNextAttemptNumber([3, 1])).toBe(4);
    expect(computeNextAttemptNumber([1, 5, 2])).toBe(6);
  });
});

describe("selectPreviousAttempt", () => {
  it("returns null when there is no prior completed attempt", () => {
    expect(selectPreviousAttempt([], 1)).toBeNull();
    expect(selectPreviousAttempt([{ attemptNumber: 1, status: "in_progress" }], 2)).toBeNull();
  });

  it("picks the most recent completed attempt before the current one", () => {
    const attempts = [
      { attemptNumber: 1, status: "completed" as const },
      { attemptNumber: 2, status: "completed" as const },
      { attemptNumber: 3, status: "abandoned" as const },
    ];
    expect(selectPreviousAttempt(attempts, 4)?.attemptNumber).toBe(2);
  });

  it("ignores abandoned or in-progress attempts even if they are more recent", () => {
    const attempts = [
      { attemptNumber: 1, status: "completed" as const },
      { attemptNumber: 2, status: "abandoned" as const },
      { attemptNumber: 3, status: "in_progress" as const },
    ];
    expect(selectPreviousAttempt(attempts, 4)?.attemptNumber).toBe(1);
  });

  it("never selects an attempt that is not strictly before the current one", () => {
    const attempts = [
      { attemptNumber: 2, status: "completed" as const },
      { attemptNumber: 3, status: "completed" as const },
    ];
    expect(selectPreviousAttempt(attempts, 2)).toBeNull();
  });
});
