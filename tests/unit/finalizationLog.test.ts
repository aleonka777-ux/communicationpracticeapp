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
});
