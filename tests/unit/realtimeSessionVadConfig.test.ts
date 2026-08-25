import { describe, expect, it, vi, beforeEach } from "vitest";
import type { CommunicationToolRow, ScenarioRow } from "@/lib/db/types";

const { create } = vi.hoisted(() => ({ create: vi.fn() }));

vi.mock("openai", () => ({
  default: class FakeOpenAI {
    realtime = { clientSecrets: { create } };
  },
}));

vi.mock("@/lib/env", () => ({
  serverEnv: {
    openaiApiKey: "test-key",
    realtimeModel: "gpt-realtime-2.1",
    realtimeVoice: "alloy",
  },
}));

vi.mock("@/lib/simulation/promptBuilder", () => ({
  buildInterlocutorSystemPrompt: () => "fake interlocutor instructions",
}));

import { createRealtimeClientCredential } from "@/lib/realtime/session";

describe("createRealtimeClientCredential — turn_detection configuration", () => {
  beforeEach(() => {
    create.mockReset();
    create.mockResolvedValue({ value: "secret", expires_at: 123 });
  });

  it("disables server-side auto-interrupt and raises the VAD threshold, per the acoustic-echo fix", async () => {
    await createRealtimeClientCredential({} as CommunicationToolRow, {} as ScenarioRow);

    expect(create).toHaveBeenCalledTimes(1);
    const turnDetection = create.mock.calls[0][0].session.audio.input.turn_detection;

    // interrupt_response MUST stay false: the client (src/lib/realtime/bargeIn.ts) now owns the
    // interrupt decision, only after a short confirmation window — a regression back to `true`
    // would silently reintroduce "one echo blip cancels the AI" in production.
    expect(turnDetection.interrupt_response).toBe(false);
    expect(turnDetection.create_response).toBe(true);
    expect(turnDetection.type).toBe("server_vad");

    // A moderate increase from the SDK default (0.5), not an extreme value.
    expect(turnDetection.threshold).toBe(0.6);
    expect(turnDetection.threshold).toBeGreaterThan(0.5);
    expect(turnDetection.threshold).toBeLessThan(0.8);

    // silence_duration_ms/prefix_padding_ms are deliberately left unset (SDK defaults) — they
    // govern when speech is judged to have ENDED, not whether it should count as started.
    expect(turnDetection.silence_duration_ms).toBeUndefined();
    expect(turnDetection.prefix_padding_ms).toBeUndefined();
  });
});
