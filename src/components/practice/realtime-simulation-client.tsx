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
import { waitForPendingUserTranscription } from "@/lib/realtime/pendingTranscription";
import { waitForCurrentExchangeToFinish } from "@/lib/realtime/exchangeCompletion";
import { logFinalizationStage } from "@/lib/realtime/finalizationLog";

const NAVIGATION_STALL_TIMEOUT_MS = 8000;

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
  const [navigationStalled, setNavigationStalled] = useState(false);

  const connectionRef = useRef<RealtimeConnection | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const endTriggeredRef = useRef(false);
  const openingLineSentRef = useRef(false);
  const openingLineTranscriptSkippedRef = useRef(false);
  const transcriptQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const errorRetryRef = useRef<(() => void) | null>(null);
  const connectingRef = useRef(false);
  const pendingUserTranscriptionRef = useRef(false);
  const stateRef = useRef<RealtimeConnectionState>(state);
  const navigationStartedAtRef = useRef<number | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const logStage = useCallback(
    (stage: Parameters<typeof logFinalizationStage>[1], extra?: Record<string, unknown>) =>
      logFinalizationStage(sessionId, stage, extra),
    [sessionId],
  );

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

  const finishAndEvaluate = useCallback(
    async (reason: "manual" | "timer") => {
      if (endTriggeredRef.current) return;
      endTriggeredRef.current = true;
      try {
        if (reason === "manual") {
          // An explicit user stop cuts over immediately — cancel any in-progress AI turn rather
          // than waiting for it, unlike ordinary timer expiry (see waitForCurrentExchangeToFinish).
          dispatch({ type: "END_PRACTICE" });
          connectionRef.current?.sendEvent({ type: "response.cancel" });
        } else {
          // 0:00 means finish after the current exchange, not cut it off mid-word: let the user
          // finish speaking and let any resulting AI response play out completely before ending.
          // No response.cancel here — nothing is being interrupted.
          logStage("waiting_for_current_exchange_to_finish");
          await waitForCurrentExchangeToFinish(stateRef, pendingUserTranscriptionRef);
          dispatch({ type: "TIME_UP" });
        }

        // Give the user's last utterance a bounded window to finish transcribing before the
        // connection goes away, so ending right as they stop speaking doesn't silently drop it.
        logStage("waiting_for_final_turn_transcription");
        await waitForPendingUserTranscription(pendingUserTranscriptionRef);

        connectionRef.current?.close();
        connectionRef.current = null;
        logStage("realtime_closed");

        dispatch({ type: "EVALUATION_STARTED" });

        // Drain any transcript writes already queued (including one just enqueued above) —
        // appendMessage() is a read-then-write, so the final turn must be persisted before
        // /api/practice/end reads the transcript, or it's invisible to the Evaluation Engine.
        await transcriptQueueRef.current;
        logStage("transcript_flushed");

        logStage("practice_end_started");
        await postJson("/api/practice/end", { sessionId });
        logStage("practice_end_succeeded");

        dispatch({ type: "EVALUATION_COMPLETE" });
        navigationStartedAtRef.current = Date.now();
        logStage("navigation_started");
        router.push(`/practice/${sessionId}/feedback`);
      } catch (error) {
        endTriggeredRef.current = false;
        const message = error instanceof Error ? error.message : "Couldn't generate feedback.";
        logStage("practice_end_failed", { message });
        setErrorMessage(message);
        errorRetryRef.current = () => {
          setErrorMessage(null);
          void finishAndEvaluate(reason);
        };
      }
    },
    [router, sessionId, logStage],
  );

  const connect = useCallback(async () => {
    if (connectingRef.current) return;
    connectingRef.current = true;
    setErrorMessage(null);
    setPeerConnectivity("connecting");
    openingLineSentRef.current = false;
    openingLineTranscriptSkippedRef.current = false;
    pendingUserTranscriptionRef.current = false;

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
              pendingUserTranscriptionRef.current = true;
              dispatch({ type: "USER_STOPPED_SPEAKING" });
              break;
            case "conversation.item.input_audio_transcription.completed": {
              pendingUserTranscriptionRef.current = false;
              const transcript = String(event.transcript ?? "").trim();
              if (transcript) void enqueueTranscript("user", transcript);
              break;
            }
            case "conversation.item.input_audio_transcription.failed":
              pendingUserTranscriptionRef.current = false;
              console.error("[voice:realtime] user speech transcription failed (turn continues)", event.error);
              break;
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
      // This component unmounts when navigation away actually lands — logging here (rather than
      // right after router.push) is what tells us navigation genuinely completed, as opposed to
      // silently stalling with the old page still mounted (see navigationStalled below).
      if (navigationStartedAtRef.current) {
        logFinalizationStage(sessionId, "navigation_completed", {
          elapsedMs: Date.now() - navigationStartedAtRef.current,
        });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Countdown timer — identical behavior to the batch simulation screen, except reaching 0:00 no
  // longer ends the session immediately (see finishAndEvaluate's "timer" branch).
  useEffect(() => {
    if (state === "ending" || state === "evaluating" || state === "complete") return;
    const interval = setInterval(() => {
      const next = computeRemainingSeconds(startedAtIso, durationSeconds);
      setRemaining(next);
      if (next <= 0) {
        clearInterval(interval);
        logStage("timer_expired");
        void finishAndEvaluate("timer");
      }
    }, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, startedAtIso, durationSeconds]);

  // router.push() is fire-and-forget — it returns void and never surfaces a stalled or failed
  // background navigation. If evaluation succeeded but this component is still mounted well after
  // navigation was requested, offer a manual way out rather than leaving the user stuck forever.
  useEffect(() => {
    if (state !== "complete") return;
    const timeout = setTimeout(() => {
      logStage("navigation_stalled");
      setNavigationStalled(true);
    }, NAVIGATION_STALL_TIMEOUT_MS);
    return () => clearTimeout(timeout);
  }, [state, logStage]);

  function handleEndPractice() {
    logStage("end_practice_requested");
    void finishAndEvaluate("manual");
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

  // "complete" is included here (not just "ending"/"evaluating") so the session never flips back
  // to showing live mic/text controls once it's actually over — it's either about to navigate
  // away, or navigationStalled below is offering a manual way out. Root cause of the production
  // "stuck on Wrapping up…" report: this state previously had no distinct label, and router.push()
  // has no way to report a stalled or failed background navigation, so there was nothing to
  // distinguish "still evaluating" from "done, waiting on navigation" — or to recover from the
  // latter.
  const isEnding = state === "ending" || state === "evaluating" || state === "complete";
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
              : state === "complete"
                ? "Feedback ready — opening…"
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

      {navigationStalled ? (
        <div className="mb-3 flex flex-col items-center gap-2 rounded-xl bg-surface-muted px-4 py-3 text-center text-sm text-foreground-muted">
          <span>Your feedback is ready, but we couldn&apos;t automatically open it.</span>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              // A plain full-page navigation, deliberately not router.push() — this is the
              // recovery path for exactly the case where the client-side router already failed
              // to get us here. Evaluation already succeeded, so this only re-reads it, never
              // re-runs it.
              window.location.assign(`/practice/${sessionId}/feedback`);
            }}
          >
            View feedback
          </Button>
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
          <Spinner className="h-4 w-4" />
          {state === "complete" ? "Opening your feedback…" : "Wrapping up and preparing your feedback…"}
        </div>
      )}

      <audio ref={remoteAudioRef} autoPlay className="hidden" />
    </div>
  );
}
