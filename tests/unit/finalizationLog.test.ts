import { describe, expect, it, vi, afterEach } from "vitest";
import { logFinalizationStage } from "@/lib/realtime/finalizationLog";

describe("logFinalizationStage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs the stage, session id, and a timestamp, never transcript text", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});

    logFinalizationStage("session-123", "practice_end_succeeded", { extraDetail: "ok" });

    expect(spy).toHaveBeenCalledTimes(1);
    const [message, payload] = spy.mock.calls[0];
    expect(message).toContain("practice_end_succeeded");
    expect(payload).toMatchObject({ sessionId: "session-123", extraDetail: "ok" });
    expect(typeof (payload as { ts: string }).ts).toBe("string");
  });

  // 5. Navigation-completion detection — see /docs/DECISIONS.md "Navigation-latency fix" and
  // navigationRecovery.ts's own doc comment: realtime-simulation-client.tsx logs this stage from
  // its mount effect's CLEANUP function, i.e. only when the component actually unmounts (React
  // Router genuinely swapping in the destination route), carrying the real elapsed time since
  // navigation began — never logged speculatively or on a timer.
  it("carries an elapsedMs field for the navigation_completed stage, reflecting actual route completion rather than a guess", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    logFinalizationStage("session-123", "navigation_completed", { elapsedMs: 8464 });

    expect(spy).toHaveBeenCalledTimes(1);
    const [message, payload] = spy.mock.calls[0];
    expect(message).toContain("navigation_completed");
    expect(payload).toMatchObject({ sessionId: "session-123", elapsedMs: 8464 });
  });
});
