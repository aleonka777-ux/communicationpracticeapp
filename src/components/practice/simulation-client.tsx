"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Lightbulb, Mic, Send, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Transcript, type TranscriptMessage } from "@/components/practice/transcript";
import { TimerBadge } from "@/components/practice/timer-badge";
import { Spinner } from "@/components/ui/state";
import { cn } from "@/lib/utils";
import { transition, type SimulationState } from "@/lib/simulation/stateMachine";
import { computeRemainingSeconds } from "@/lib/practice/timer";
import type { PracticeMode } from "@/lib/db/types";

export interface SimulationClientProps {
  sessionId: string;
  aiLabel: string;
  userObjective: string;
  mode: PracticeMode;
  startedAtIso: string;
  durationSeconds: number;
  initialMessages: TranscriptMessage[];
  demoMode: boolean;
  voiceAvailable: boolean;
}

export function SimulationClient({
  sessionId,
  aiLabel,
  userObjective,
  mode,
  startedAtIso,
  durationSeconds,
  initialMessages,
  demoMode,
  voiceAvailable: initialVoiceAvailable,
}: SimulationClientProps) {
  const router = useRouter();
  const [state, dispatch] = useReducer(transition, "preparing" as SimulationState);
  const [messages, setMessages] = useState<TranscriptMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(() => computeRemainingSeconds(startedAtIso, durationSeconds));
  const [voiceAvailable, setVoiceAvailable] = useState(initialVoiceAvailable);
  const endTriggered = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  const submitMessage = async (text: string) => {
    setMessages((prev) => [...prev, { id: `optimistic-${Date.now()}`, speaker: "user", text }]);
    try {
      const res = await fetch("/api/simulation/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, message: text }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "The other person didn't respond. Please try again.");
      }
      const { reply } = (await res.json()) as { reply: TranscriptMessage };
      setMessages((prev) => [...prev, reply]);
      dispatch({ type: "REPLY_RECEIVED" });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Something went wrong.");
      dispatch({ type: "ERROR" });
    }
  };

  // Advances preparing -> interlocutor_speaking automatically, then plays each interlocutor
  // line as speech when voice is available (opening line included), falling back to an
  // immediate SPEECH_FINISHED when it isn't.
  useEffect(() => {
    if (state === "preparing") {
      dispatch({ type: "PREPARED" });
      return;
    }
    if (state !== "interlocutor_speaking") return;

    let cancelled = false;
    const lastMessage = messages[messages.length - 1];

    async function speak() {
      if (!voiceAvailable || !lastMessage || lastMessage.speaker !== "interlocutor") {
        if (!cancelled) dispatch({ type: "SPEECH_FINISHED" });
        return;
      }
      try {
        const res = await fetch("/api/voice/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, text: lastMessage.text }),
        });
        if (!res.ok) {
          if (res.status === 503) setVoiceAvailable(false);
          throw new Error("tts unavailable");
        }
        const { audioBase64, mimeType } = (await res.json()) as { audioBase64: string; mimeType: string };
        const audio = new Audio(`data:${mimeType};base64,${audioBase64}`);
        audioRef.current = audio;
        audio.onended = () => !cancelled && dispatch({ type: "SPEECH_FINISHED" });
        audio.onerror = () => !cancelled && dispatch({ type: "SPEECH_FINISHED" });
        await audio.play();
      } catch {
        if (!cancelled) dispatch({ type: "SPEECH_FINISHED" });
      }
    }

    void speak();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const finishAndEvaluate = async () => {
    if (endTriggered.current) return;
    endTriggered.current = true;
    dispatch({ type: "EVALUATION_STARTED" });
    try {
      const res = await fetch("/api/practice/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Couldn't generate feedback.");
      }
      dispatch({ type: "EVALUATION_COMPLETE" });
      router.push(`/practice/${sessionId}/feedback`);
    } catch (error) {
      endTriggered.current = false;
      setErrorMessage(error instanceof Error ? error.message : "Something went wrong.");
      dispatch({ type: "ERROR" });
    }
  };

  // Countdown timer.
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || state !== "ready") return;

    setInput("");
    setErrorMessage(null);
    dispatch({ type: "SUBMIT_MESSAGE" });
    await submitMessage(text);
  }

  async function startRecording() {
    if (state !== "ready" || !voiceAvailable) return;
    setErrorMessage(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        void handleRecordingStopped(recorder.mimeType || "audio/webm");
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      dispatch({ type: "START_RECORDING" });
    } catch {
      setErrorMessage("Microphone access was denied. You can still type your response below.");
    }
  }

  function stopRecording() {
    if (state !== "recording") return;
    dispatch({ type: "STOP_RECORDING" });
    mediaRecorderRef.current?.stop();
  }

  async function handleRecordingStopped(mimeType: string) {
    const blob = new Blob(chunksRef.current, { type: mimeType });
    if (blob.size === 0) {
      setErrorMessage("Didn't catch that recording. Please try again or type instead.");
      dispatch({ type: "ERROR" });
      return;
    }
    try {
      const formData = new FormData();
      formData.append("sessionId", sessionId);
      formData.append("audio", blob, "recording.webm");
      const res = await fetch("/api/voice/stt", { method: "POST", body: formData });
      if (!res.ok) {
        if (res.status === 503) setVoiceAvailable(false);
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Couldn't transcribe your recording.");
      }
      const { text } = (await res.json()) as { text: string };
      dispatch({ type: "TRANSCRIBED" });
      await submitMessage(text);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Something went wrong.");
      dispatch({ type: "ERROR" });
    }
  }

  async function handleHint() {
    if (state !== "ready") return;
    setErrorMessage(null);
    dispatch({ type: "REQUEST_HINT" });
    try {
      const res = await fetch("/api/simulation/hint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Couldn't get a hint. Please try again.");
      }
      const { hint } = (await res.json()) as { hint: string };
      setMessages((prev) => [...prev, { id: `hint-${Date.now()}`, speaker: "coach_hint", text: hint }]);
      dispatch({ type: "HINT_RECEIVED" });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Something went wrong.");
      dispatch({ type: "ERROR" });
    }
  }

  function handleEndPractice() {
    dispatch({ type: "END_PRACTICE" });
    void finishAndEvaluate();
  }

  function handleRetry() {
    setErrorMessage(null);
    dispatch({ type: "RETRY" });
  }

  const isThinking = state === "interlocutor_thinking";
  const isHinting = state === "paused_for_hint";
  const isEnding = state === "ending" || state === "evaluating";
  const isRecording = state === "recording";
  const isTranscribing = state === "transcribing";
  const canInteract = state === "ready";

  return (
    <div className="flex min-h-[calc(100dvh-8.5rem)] flex-col">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-foreground">{aiLabel}</p>
          <p className="text-xs text-foreground-muted">Objective: {userObjective}</p>
        </div>
        <TimerBadge remainingSeconds={remaining} urgent={remaining <= 20} />
      </div>

      {demoMode ? (
        <p className="mb-3 rounded-lg bg-surface-muted px-3 py-1.5 text-xs text-foreground-muted">
          Demo mode: no AI provider configured, so this conversation uses placeholder replies and voice is disabled.
        </p>
      ) : null}

      <div className="flex-1 overflow-y-auto pb-3">
        <Transcript messages={messages} aiLabel={aiLabel} />
        {isThinking ? (
          <div className="mt-3 flex items-center gap-2 text-sm text-foreground-muted">
            <Spinner className="h-4 w-4" /> {aiLabel} is responding…
          </div>
        ) : null}
        {isTranscribing ? (
          <div className="mt-3 flex items-center gap-2 text-sm text-foreground-muted">
            <Spinner className="h-4 w-4" /> Transcribing what you said…
          </div>
        ) : null}
        {isEnding ? (
          <div className="mt-3 flex items-center gap-2 text-sm text-foreground-muted">
            <Spinner className="h-4 w-4" /> Wrapping up and preparing your feedback…
          </div>
        ) : null}
        <div ref={bottomRef} />
      </div>

      {errorMessage ? (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-xl bg-danger/10 px-4 py-2 text-sm text-danger" role="alert">
          <span>{errorMessage}</span>
          <Button type="button" size="sm" variant="outline" onClick={handleRetry}>
            Try again
          </Button>
        </div>
      ) : null}

      {!isEnding ? (
        <div className="sticky bottom-16 flex flex-col gap-2 border-t border-border bg-background pt-3">
          <form onSubmit={handleSubmit} className="flex items-end gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
              placeholder={isRecording ? "Recording…" : "Type your response…"}
              rows={1}
              className="max-h-32 min-h-11 flex-1 resize-none"
              disabled={!canInteract}
              aria-label="Your message"
            />
            {voiceAvailable ? (
              <button
                type="button"
                onClick={isRecording ? stopRecording : startRecording}
                disabled={!canInteract && !isRecording}
                aria-label={isRecording ? "Stop recording" : "Record a voice message"}
                className={cn(
                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50",
                  isRecording
                    ? "bg-danger text-primary-foreground animate-pulse"
                    : "bg-surface-muted text-foreground-muted hover:bg-border hover:text-foreground",
                )}
              >
                {isRecording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </button>
            ) : null}
            <Button type="submit" size="icon" disabled={!canInteract || !input.trim() || isRecording} aria-label="Send message">
              <Send className="h-4 w-4" />
            </Button>
          </form>

          {isRecording ? (
            <p className="flex items-center gap-1.5 text-xs font-medium text-danger" role="status">
              <span className="h-1.5 w-1.5 rounded-full bg-danger animate-pulse" aria-hidden="true" />
              Recording… tap the mic to stop
            </p>
          ) : null}

          <div className="flex items-center justify-between gap-2">
            {mode === "training" ? (
              <Button type="button" variant="outline" size="sm" onClick={handleHint} disabled={!canInteract && !isHinting} aria-busy={isHinting}>
                <Lightbulb className="h-4 w-4" />
                {isHinting ? "Getting hint…" : "Need a hint?"}
              </Button>
            ) : (
              <span />
            )}
            <Button type="button" variant="ghost" size="sm" onClick={handleEndPractice}>
              <Square className="h-3.5 w-3.5" /> End practice
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
