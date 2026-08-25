"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ear, Mic, MicOff, Send, Square, Type, Volume2, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Spinner } from "@/components/ui/state";
import { TimerBadge } from "@/components/practice/timer-badge";
import { cn } from "@/lib/utils";
import { computeRemainingSeconds } from "@/lib/practice/timer";
import { transitionRealtimeConnection, type RealtimeConnectionState } from "@/lib/realtime/connectionState";
import { connectRealtimeSession, type RealtimeConnection } from "@/lib/realtime/webrtcClient";

export interface RealtimeSimulationClientProps {
  sessionId: string;
  aiLabel: string;
  userObjective: string;
  startedAtIso: string;
  durationSeconds: number;
}

type PeerConnectivity = "connecting" | "connected" | "reconnecting" | "disconnected";

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const responseBody = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(responseBody.error || "Something went wrong.");
  }
  return res.json() as Promise<T>;
}

export function RealtimeSimulationClient({
  sessionId,
  aiLabel,
  userObjective,
  startedAtIso,
  durationSeconds,
}: RealtimeSimulationClientProps) {
  const router = useRouter();
  const [state, dispatch] = useReducer(transitionRealtimeConnection, "connecting" as RealtimeConnectionState);
  const [peerConnectivity, setPeerConnectivity] = useState<PeerConnectivity>("connecting");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showBatchFallback, setShowBatchFallback] = useState(false);
  const [showTextFallback, setShowTextFallback] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [remaining, setRemaining] = useState(() => computeRemainingSeconds(startedAtIso, durationSeconds));

  const connectionRef = useRef<RealtimeConnection | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const endTriggeredRef = useRef(false);
  const openingLineSentRef = useRef(false);
  const openingLineTranscriptSkippedRef = useRef(false);
  const transcriptQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const errorRetryRef = useRef<(() => void) | null>(null);
  const connectingRef = useRef(false);

  // Persists transcript turns one at a time — Realtime can emit the user's and the AI's
  // transcript events in quick succession, and appendMessage() assigns sequence numbers via a
  // read-then-write, so overlapping calls from one client must still be serialized.
  const enqueueTranscript = useCallback(
    (speaker: "user" | "interlocutor", text: string) => {
      transcriptQueueRef.current = transcriptQueueRef.current
        .then(() => postJson("/api/simulation/realtime/transcript", { sessionId, speaker, text }))
        .catch((error) => {
          console.error("[voice:realtime] failed to persist transcript turn", error instanceof Error ? error.message : error);
        });
      return transcriptQueueRef.current;
    },
    [sessionId],
  );

  const finishAndEvaluate = useCallback(async () => {
    if (endTriggeredRef.current) return;
    endTriggeredRef.current = true;
    connectionRef.current?.close();
    connectionRef.current = null;
    dispatch({ type: "EVALUATION_STARTED" });
    try {
      await postJson("/api/practice/end", { sessionId });
      dispatch({ type: "EVALUATION_COMPLETE" });
      router.push(`/practice/${sessionId}/feedback`);
    } catch (error) {
      endTriggeredRef.current = false;
      const message = error instanceof Error ? error.message : "Couldn't generate feedback.";
      setErrorMessage(message);
      errorRetryRef.current = () => {
        setErrorMessage(null);
        void finishAndEvaluate();
      };
    }
  }, [router, sessionId]);

  const connect = useCallback(async () => {
    if (connectingRef.current) return;
    connectingRef.current = true;
    setErrorMessage(null);
    setPeerConnectivity("connecting");
    openingLineSentRef.current = false;
    openingLineTranscriptSkippedRef.current = false;

    try {
      const { clientSecret, openingLine } = await postJson<{ clientSecret: string; openingLine: string }>(
        "/api/simulation/realtime/session",
        { sessionId },
      );

      const connection = await connectRealtimeSession(clientSecret, {
        onRemoteTrack: (stream) => {
          if (remoteAudioRef.current) remoteAudioRef.current.srcObject = stream;
        },
        onConnectionStateChange: (pcState) => {
          if (pcState === "connected") setPeerConnectivity("connected");
          else if (pcState === "disconnected") setPeerConnectivity("reconnecting");
          else if (pcState === "failed" || pcState === "closed") {
            setPeerConnectivity("disconnected");
            if (!endTriggeredRef.current) {
              setErrorMessage("Voice connection lost. You can reconnect or keep going with text.");
              setShowBatchFallback(true);
              errorRetryRef.current = () => {
                setErrorMessage(null);
                dispatch({ type: "RETRY" });
                void connect();
              };
              dispatch({ type: "ERROR" });
            }
          }
        },
        onServerEvent: (event) => {
          const type = event.type as string;
          switch (type) {
            case "session.created": {
              if (!openingLineSentRef.current) {
                openingLineSentRef.current = true;
                connection.sendEvent({
                  type: "response.create",
                  response: {
                    instructions: `Say exactly the following, word for word, and nothing else: "${openingLine}"`,
                  },
                });
              }
              dispatch({ type: "CONNECTED" });
              break;
            }
            case "input_audio_buffer.speech_started":
              dispatch({ type: "USER_STARTED_SPEAKING" });
              break;
            case "input_audio_buffer.speech_stopped":
              dispatch({ type: "USER_STOPPED_SPEAKING" });
              break;
            case "conversation.item.input_audio_transcription.completed": {
              const transcript = String(event.transcript ?? "").trim();
              if (transcript) void enqueueTranscript("user", transcript);
              break;
            }
            case "output_audio_buffer.started":
              dispatch({ type: "AI_STARTED_SPEAKING" });
              break;
            case "output_audio_buffer.stopped":
              dispatch({ type: "AI_FINISHED_SPEAKING" });
              break;
            case "response.output_audio_transcript.done": {
              // The very first AI turn is the scenario's opening line, already persisted at
              // session creation (src/lib/practice/actions.ts) — skip it here to avoid a duplicate.
              if (!openingLineTranscriptSkippedRef.current) {
                openingLineTranscriptSkippedRef.current = true;
                break;
              }
              const transcript = String(event.transcript ?? "").trim();
              if (transcript) void enqueueTranscript("interlocutor", transcript);
              break;
            }
            case "error":
              console.error("[voice:realtime] server-reported error (session continues)", event.error);
              break;
            default:
              break;
          }
        },
      });

      connectionRef.current = connection;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Couldn't start the voice conversation.";
      setErrorMessage(message);
      setPeerConnectivity("disconnected");
      setShowBatchFallback(true);
      errorRetryRef.current = () => {
        setErrorMessage(null);
        dispatch({ type: "RETRY" });
        void connect();
      };
      dispatch({ type: "ERROR" });
    } finally {
      connectingRef.current = false;
    }
  }, [sessionId, enqueueTranscript]);

  useEffect(() => {
    void connect();
    return () => {
      connectionRef.current?.close();
      connectionRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Countdown timer — identical behavior to the batch simulation screen.
  useEffect(() => {
    if (state === "ending" || state === "evaluating" || state === "complete") return;
    const interval = setInterval(() => {
      const next = computeRemainingSeconds(startedAtIso, durationSeconds);
      setRemaining(next);
      if (next <= 0) {
        clearInterval(interval);
        dispatch({ type: "TIME_UP" });
        void finishAndEvaluate();
      }
    }, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, startedAtIso, durationSeconds]);

  function handleEndPractice() {
    dispatch({ type: "END_PRACTICE" });
    void finishAndEvaluate();
  }

  async function handleTextSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = textInput.trim();
    const connection = connectionRef.current;
    if (!text || !connection || state === "ending" || state === "evaluating" || state === "complete") return;

    setTextInput("");
    void enqueueTranscript("user", text);
    connection.sendEvent({
      type: "conversation.item.create",
      item: { type: "message", role: "user", content: [{ type: "input_text", text }] },
    });
    connection.sendEvent({ type: "response.create" });
  }

  function handleRetry() {
    errorRetryRef.current?.();
  }

  const isEnding = state === "ending" || state === "evaluating";
  const stageLabel =
    state === "connecting"
      ? "Connecting…"
      : state === "listening" || state === "user_speaking"
        ? "Listening"
        : state === "thinking"
          ? "Thinking…"
          : state === "speaking"
            ? `${aiLabel} is speaking…`
            : state === "error"
              ? "Paused"
              : "Wrapping up…";

  return (
    <div className="flex min-h-[calc(100dvh-8.5rem)] flex-col">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-foreground">{aiLabel}</p>
          <p className="text-xs text-foreground-muted">Objective: {userObjective}</p>
        </div>
        <TimerBadge remainingSeconds={remaining} urgent={remaining <= 20} />
      </div>

      <div className="mb-3 flex items-center gap-1.5 text-xs text-foreground-muted">
        {peerConnectivity === "connected" ? (
          <Wifi className="h-3.5 w-3.5 text-accent-green" aria-hidden="true" />
        ) : (
          <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        {peerConnectivity === "connected" ? "Connected" : peerConnectivity === "connecting" ? "Connecting…" : peerConnectivity === "reconnecting" ? "Reconnecting…" : "Disconnected"}
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-6 py-8">
        <div
          className={cn(
            "flex h-32 w-32 items-center justify-center rounded-full transition-colors",
            state === "speaking" && "bg-primary/15",
            (state === "listening" || state === "user_speaking") && "bg-accent-green/15",
            state === "thinking" && "bg-surface-muted",
            state === "connecting" && "bg-surface-muted",
            (state === "error" || isEnding) && "bg-surface-muted",
          )}
          role="status"
          aria-live="polite"
        >
          {state === "connecting" ? (
            <Spinner className="h-8 w-8 text-foreground-muted" />
          ) : state === "speaking" ? (
            <Volume2 className="h-10 w-10 animate-pulse text-primary" aria-hidden="true" />
          ) : state === "listening" || state === "user_speaking" ? (
            <Ear className={cn("h-10 w-10 text-accent-green", state === "user_speaking" && "animate-pulse")} aria-hidden="true" />
          ) : state === "thinking" ? (
            <Spinner className="h-8 w-8 text-foreground-muted" />
          ) : state === "error" ? (
            <MicOff className="h-10 w-10 text-danger" aria-hidden="true" />
          ) : (
            <Spinner className="h-8 w-8 text-foreground-muted" />
          )}
        </div>
        <p className="text-sm font-medium text-foreground">{stageLabel}</p>
      </div>

      {errorMessage ? (
        <div className="mb-3 flex flex-col gap-2 rounded-xl bg-danger/10 px-4 py-2 text-sm text-danger" role="alert">
          <span>{errorMessage}</span>
          <div className="flex items-center gap-2">
            {errorRetryRef.current ? (
              <Button type="button" size="sm" variant="outline" onClick={handleRetry}>
                Try again
              </Button>
            ) : null}
            {showBatchFallback ? (
              <Link href={`/practice/${sessionId}?voiceMode=batch`}>
                <Button type="button" size="sm" variant="ghost">
                  Continue by text instead
                </Button>
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}

      {!isEnding ? (
        <div className="flex flex-col gap-2 border-t border-border pt-3">
          {showTextFallback ? (
            <form onSubmit={handleTextSubmit} className="flex items-end gap-2">
              <Textarea
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleTextSubmit(e);
                  }
                }}
                placeholder="Type your response…"
                rows={1}
                className="max-h-32 min-h-11 flex-1 resize-none"
                aria-label="Your message"
              />
              <Button type="submit" size="icon" disabled={!textInput.trim()} aria-label="Send message">
                <Send className="h-4 w-4" />
              </Button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setShowTextFallback(true)}
              className="flex items-center justify-center gap-1.5 text-xs font-medium text-foreground-muted underline"
            >
              <Type className="h-3.5 w-3.5" /> Type instead
            </button>
          )}
          {showTextFallback ? (
            <button
              type="button"
              onClick={() => setShowTextFallback(false)}
              className="flex items-center justify-center gap-1.5 text-xs font-medium text-foreground-muted underline"
            >
              <Mic className="h-3.5 w-3.5" /> Back to voice
            </button>
          ) : null}

          <Button type="button" variant="ghost" size="sm" onClick={handleEndPractice} className="self-center">
            <Square className="h-3.5 w-3.5" /> End practice
          </Button>
        </div>
      ) : (
        <div className="flex items-center justify-center gap-2 border-t border-border pt-3 text-sm text-foreground-muted">
          <Spinner className="h-4 w-4" /> Wrapping up and preparing your feedback…
        </div>
      )}

      <audio ref={remoteAudioRef} autoPlay className="hidden" />
    </div>
  );
}
