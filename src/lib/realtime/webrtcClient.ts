/**
 * Browser-only WebRTC transport for an OpenAI Realtime session. Not an SDK helper — the OpenAI
 * Node SDK only ships a WebSocket client (openai/realtime/websocket); WebRTC's SDP exchange is a
 * plain browser API + one HTTPS POST, per https://platform.openai.com/docs/guides/realtime-webrtc.
 * The ephemeral `clientSecret` (minted server-side, see src/lib/realtime/session.ts) is the only
 * credential this ever sees — OPENAI_API_KEY never reaches the browser.
 */

const REALTIME_CALLS_URL = "https://api.openai.com/v1/realtime/calls";

export interface RealtimeConnectionHandlers {
  onServerEvent: (event: Record<string, unknown>) => void;
  onRemoteTrack: (stream: MediaStream) => void;
  onConnectionStateChange?: (state: RTCPeerConnectionState) => void;
}

export interface RealtimeConnection {
  sendEvent: (event: Record<string, unknown>) => void;
  close: () => void;
}

function waitForIceGatheringComplete(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    function check() {
      if (pc.iceGatheringState === "complete") {
        pc.removeEventListener("icegatheringstatechange", check);
        resolve();
      }
    }
    pc.addEventListener("icegatheringstatechange", check);
    // Safety timeout in case gathering stalls on a restrictive network — proceed with whatever
    // candidates were found rather than blocking the conversation from starting at all.
    setTimeout(() => {
      pc.removeEventListener("icegatheringstatechange", check);
      resolve();
    }, 2000);
  });
}

/**
 * Opens the mic, negotiates a WebRTC connection to OpenAI Realtime using the given ephemeral
 * client secret, and wires up the data channel used for session/transcript events. Throws with a
 * clear message if the SDP exchange itself fails (e.g. the endpoint above changes shape) or if
 * getUserMedia is denied.
 */
export async function connectRealtimeSession(
  clientSecret: string,
  handlers: RealtimeConnectionHandlers,
): Promise<RealtimeConnection> {
  const localStream = await navigator.mediaDevices.getUserMedia({ audio: true });

  const pc = new RTCPeerConnection();
  localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

  pc.ontrack = (event) => {
    if (event.streams[0]) handlers.onRemoteTrack(event.streams[0]);
  };
  if (handlers.onConnectionStateChange) {
    const onChange = handlers.onConnectionStateChange;
    pc.onconnectionstatechange = () => onChange(pc.connectionState);
  }

  const dataChannel = pc.createDataChannel("oai-events");
  dataChannel.addEventListener("message", (event) => {
    try {
      handlers.onServerEvent(JSON.parse(event.data));
    } catch {
      // Malformed/unrecognized event payload — ignore rather than crash the session.
    }
  });

  const close = () => {
    localStream.getTracks().forEach((track) => track.stop());
    try {
      dataChannel.close();
    } catch {
      // already closed
    }
    pc.close();
  };

  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await waitForIceGatheringComplete(pc);

    const sdp = pc.localDescription?.sdp;
    if (!sdp) throw new Error("Couldn't prepare the connection offer.");

    const response = await fetch(REALTIME_CALLS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${clientSecret}`,
        "Content-Type": "application/sdp",
      },
      body: sdp,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Realtime connection failed (${response.status}).${detail ? ` ${detail}` : ""}`);
    }

    const answerSdp = await response.text();
    await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
  } catch (error) {
    close();
    throw error;
  }

  return {
    sendEvent: (event) => {
      if (dataChannel.readyState === "open") dataChannel.send(JSON.stringify(event));
    },
    close,
  };
}
