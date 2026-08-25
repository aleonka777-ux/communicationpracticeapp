import { describe, expect, it, vi, afterEach } from "vitest";
import { logRealtimeDebugEvent } from "@/lib/realtime/debugLog";

describe("logRealtimeDebugEvent", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs via console.debug with the session id, event, timestamp, and extra fields — never raw audio", () => {
    const spy = vi.spyOn(console, "debug").mockImplementation(() => {});

    logRealtimeDebugEvent("session-1", "speech_started_during_ai_audio", { durationMs: 120, wasInterrupted: false });

    expect(spy).toHaveBeenCalledTimes(1);
    const [message, payload] = spy.mock.calls[0];
    expect(message).toContain("speech_started_during_ai_audio");
    expect(payload).toMatchObject({ sessionId: "session-1", durationMs: 120, wasInterrupted: false });
    expect(typeof (payload as { ts: string }).ts).toBe("string");
  });
});
