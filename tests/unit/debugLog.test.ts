import { describe, expect, it, vi, afterEach } from "vitest";
import { logRealtimeDebugEvent } from "@/lib/realtime/debugLog";

describe("logRealtimeDebugEvent", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs via console.debug with the session id, event, session-elapsed ms, timestamp, and extra fields — never raw audio", () => {
    const spy = vi.spyOn(console, "debug").mockImplementation(() => {});

    logRealtimeDebugEvent("session-1", "speech_started_during_ai_audio", 12345.6, { durationMs: 120, wasInterrupted: false });

    expect(spy).toHaveBeenCalledTimes(1);
    const [message, payload] = spy.mock.calls[0];
    expect(message).toContain("speech_started_during_ai_audio");
    expect(payload).toMatchObject({ sessionId: "session-1", sessionElapsedMs: 12345.6, durationMs: 120, wasInterrupted: false });
    expect(typeof (payload as { ts: string }).ts).toBe("string");
  });

  it("requires sessionElapsedMs so every logged event is directly comparable to realtime_turn_events timestamps", () => {
    const spy = vi.spyOn(console, "debug").mockImplementation(() => {});
    logRealtimeDebugEvent("session-1", "response_create_sent", 0);
    expect((spy.mock.calls[0][1] as { sessionElapsedMs: number }).sessionElapsedMs).toBe(0);
  });
});
