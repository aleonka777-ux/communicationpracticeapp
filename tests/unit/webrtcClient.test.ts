import { describe, expect, it, vi, afterEach } from "vitest";
import { connectRealtimeSession, MIC_AUDIO_CONSTRAINTS } from "@/lib/realtime/webrtcClient";

function makeFakeTrack(getSettingsImpl?: () => MediaTrackSettings) {
  return {
    stop: vi.fn(),
    getSettings: vi.fn(getSettingsImpl ?? (() => ({ echoCancellation: true, noiseSuppression: true, autoGainControl: true }))),
  } as unknown as MediaStreamTrack;
}

function makeFakeStream(track: MediaStreamTrack) {
  return {
    getTracks: () => [track],
    getAudioTracks: () => [track],
  } as unknown as MediaStream;
}

class FakePeerConnection {
  ontrack: ((event: { streams: MediaStream[] }) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  connectionState: RTCPeerConnectionState = "connected";
  iceGatheringState: RTCIceGatheringState = "complete";
  localDescription = { sdp: "fake-local-sdp", type: "offer" } as RTCSessionDescription;

  addTrack = vi.fn();
  createDataChannel = vi.fn(() => ({
    readyState: "open",
    addEventListener: vi.fn(),
    send: vi.fn(),
    close: vi.fn(),
  }));
  createOffer = vi.fn(async () => ({ type: "offer" as const, sdp: "fake-local-sdp" }));
  setLocalDescription = vi.fn(async () => undefined);
  setRemoteDescription = vi.fn(async () => undefined);
  close = vi.fn();
  addEventListener = vi.fn();
  removeEventListener = vi.fn();
}

function stubBrowserGlobals(getUserMedia: ReturnType<typeof vi.fn>) {
  vi.stubGlobal("RTCPeerConnection", FakePeerConnection as unknown as typeof RTCPeerConnection);
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, text: async () => "v=0\r\nfake-answer-sdp" }) as Response),
  );
}

describe("connectRealtimeSession — microphone constraints", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requests echoCancellation, noiseSuppression, and autoGainControl as plain (non-exact) constraints", async () => {
    const track = makeFakeTrack();
    const getUserMedia = vi.fn(async () => makeFakeStream(track));
    stubBrowserGlobals(getUserMedia);

    await connectRealtimeSession("secret", { onServerEvent: vi.fn(), onRemoteTrack: vi.fn() });

    expect(getUserMedia).toHaveBeenCalledWith({ audio: MIC_AUDIO_CONSTRAINTS });
    // Never `{ exact: true }` — that form throws OverconstrainedError on unsupported browsers.
    expect(MIC_AUDIO_CONSTRAINTS.echoCancellation).toBe(true);
    expect(MIC_AUDIO_CONSTRAINTS.noiseSuppression).toBe(true);
    expect(MIC_AUDIO_CONSTRAINTS.autoGainControl).toBe(true);
  });

  it("reports the actually-applied track settings via onMicTrackSettings, without touching audio content", async () => {
    const settings = { echoCancellation: true, noiseSuppression: false, autoGainControl: true, sampleRate: 48000 };
    const track = makeFakeTrack(() => settings);
    const getUserMedia = vi.fn(async () => makeFakeStream(track));
    stubBrowserGlobals(getUserMedia);

    const onMicTrackSettings = vi.fn();
    await connectRealtimeSession("secret", { onServerEvent: vi.fn(), onRemoteTrack: vi.fn(), onMicTrackSettings });

    expect(onMicTrackSettings).toHaveBeenCalledWith(settings);
  });

  it("still connects successfully when the browser doesn't support getSettings() on the track", async () => {
    const track = makeFakeTrack(() => {
      throw new Error("getSettings not supported in this browser");
    });
    const getUserMedia = vi.fn(async () => makeFakeStream(track));
    stubBrowserGlobals(getUserMedia);

    const onMicTrackSettings = vi.fn();
    await expect(
      connectRealtimeSession("secret", { onServerEvent: vi.fn(), onRemoteTrack: vi.fn(), onMicTrackSettings }),
    ).resolves.toBeDefined();
    // The diagnostic callback never received anything, but the call did not throw or crash.
    expect(onMicTrackSettings).not.toHaveBeenCalled();
  });

  it("still connects successfully when onMicTrackSettings is not provided at all", async () => {
    const track = makeFakeTrack();
    const getUserMedia = vi.fn(async () => makeFakeStream(track));
    stubBrowserGlobals(getUserMedia);

    await expect(connectRealtimeSession("secret", { onServerEvent: vi.fn(), onRemoteTrack: vi.fn() })).resolves.toBeDefined();
  });

  it("exposes the local mic stream on the returned connection, for Phase 4A's speech-delivery evidence layer", async () => {
    const track = makeFakeTrack();
    const stream = makeFakeStream(track);
    const getUserMedia = vi.fn(async () => stream);
    stubBrowserGlobals(getUserMedia);

    const connection = await connectRealtimeSession("secret", { onServerEvent: vi.fn(), onRemoteTrack: vi.fn() });
    expect(connection.localStream).toBe(stream);
  });
});
