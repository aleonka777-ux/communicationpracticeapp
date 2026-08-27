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
import { createBargeInController, DEFAULT_BARGE_IN_CONFIRM_MS, type BargeInController } from "@/lib/realtime/bargeIn";
import { computeStartupConfirmMs } from "@/lib/realtime/startupGuard";
import { logRealtimeDebugEvent } from "@/lib/realtime/debugLog";
import {
  createSessionTimeline,
  formatSessionTimelineDebugLines,
  type AiResponseStatus,
  type SessionTimeline,
} from "@/lib/realtime/sessionTimeline";
import { createSpeechDeliveryTracker, type SpeechDeliveryTracker } from "@/lib/realtime/speechDeliveryTracker";
import { startMicEnergyMonitor, type MicEnergyMonitorHandle } from "@/lib/realtime/micEnergyMonitor";
import { formatSpeechDeliveryDebugLines } from "@/lib/realtime/speechDeliveryDebug";
import { mergeSpeechDeliveryEvidence } from "@/lib/realtime/mergeSpeechDeliveryEvidence";
import { safeCall } from "@/lib/realtime/safeCall";
import type { MetricsPayload } from "@/lib/realtime/metricsPayload";

const NAVIGATION_STALL_TIMEOUT_MS = 8000;

/**
 * Response-stall incident fix (see /docs/DECISIONS.md "Response-stall incident"): production showed
 * the UI stuck in "Thinking" for ~43-45 seconds after the AI failed to respond, with nothing in the
 * client able to detect or recover from it — connectionState.ts has no timeout of its own, and
 * `response.done`/`error` events never dispatch a state transition regardless of outcome. This is a
 * RECOVERY AFFORDANCE trigger, not an automatic retry: current Realtime semantics give the client no
 * reliable way to know whether a response is still silently active server-side (no state-query
 * capability exists over this transport), so blindly sending another `response.create` risks a
 * duplicate/overlapping AI reply once a merely-slow response eventually arrives — see the module's
 * own doc comment at the watchdog effect below for the full reasoning. 12 seconds is deliberately
 * generous: roughly 20x the ~600ms median AI response latency this app has measured in production,
 * so it will not fire on an ordinary (if slow) reply, while still firing with more than 30 seconds
 * to spare against the exact incident that motivated this (a ~43-45s stall).
 */
const THINKING_STALL_TIMEOUT_MS = 12000;

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
  /** Set once THINKING_STALL_TIMEOUT_MS elapses while still in "thinking" — a recovery affordance,
   *  never an automatic response.create retry. See THINKING_STALL_TIMEOUT_MS's doc comment. */
  const [thinkingStallDetected, setThinkingStallDetected] = useState(false);

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
  /** Diagnostics only, for telling a real barge-in apart from echo/noise — see debugLog.ts. */
  const aiAudioSpeechIncidentRef = useRef<{
    startedAt: number;
    wasInterrupted: boolean;
    isFirstAiResponse: boolean;
    confirmMsUsed: number;
    sessionElapsedMs: number;
    sinceFirstAiAudioMs: number | null;
  } | null>(null);
  /** True until the AI's first turn (the opening line) finishes — see src/lib/realtime/startupGuard.ts. */
  const isFirstAiResponseRef = useRef(true);
  /** Real concurrent evidence of whether AI audio is CURRENTLY, actually playing — true from
   *  `output_audio_buffer.started` until `.stopped`/`.cleared`. Distinct from bargeIn.ts's own
   *  internal "aiSpeaking" flag, which deliberately also covers the earlier `response.created`
   *  pre-playback window for a different purpose (echo protection during that gap) — this ref
   *  tracks audible playback specifically, since that's the fact the UI must reflect. See
   *  /docs/DECISIONS.md "State-machine race: Thinking shown during audible AI playback". */
  const aiAudioPlayingRef = useRef(false);
  const sessionMountedAtRef = useRef(Date.now());
  const firstAiAudioStartAtRef = useRef<number | null>(null);
  const micSettingsRef = useRef<MediaTrackSettings | null>(null);
  /** The bargeIn controller from the most recent connect() attempt — tracked so a reconnect can
   *  reset() the PREVIOUS instance's pending confirmation timer before abandoning it. A real
   *  setTimeout does not get cancelled just because its enclosing closure is abandoned: without
   *  this, a stale timer from a dead connection could still fire later and call onConfirmedBargeIn
   *  against a since-replaced connection, recording a spurious confirmed-barge-in metric event
   *  uncorrelated with anything the user actually did. */
  const bargeInRef = useRef<BargeInController | null>(null);
  /** Objective timing/interruption measurement layer — spans the whole practice session (created
   *  once at mount), not per WebRTC connection attempt, since a reconnect is a technical hiccup,
   *  not a new session from the user's or the metrics' point of view. See sessionTimeline.ts. */
  const metricsRef = useRef<SessionTimeline | null>(null);
  /** Phase 4A speech-delivery evidence (pauses, relative intensity) — same session-spanning
   *  lifetime as metricsRef, for the same reason (a reconnect is a technical hiccup, not a new
   *  session). See speechDeliveryTracker.ts. */
  const speechDeliveryRef = useRef<SpeechDeliveryTracker | null>(null);
  /** The live mic-energy analyser for the CURRENT WebRTC connection attempt — stopped and replaced
   *  on every reconnect (mirrors bargeInRef's own doc comment: a stale one must never keep feeding
   *  samples after its underlying connection/stream is gone). */
  const micMonitorRef = useRef<MicEnergyMonitorHandle | null>(null);
  /** Response ids that have already logged their first response.output_audio.delta — see the
   *  "response.output_audio.delta" case below. Diagnostic-only bookkeeping, never persisted. */
  const respondedWithFirstDeltaRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const sessionElapsedMs = useCallback(() => Date.now() - sessionMountedAtRef.current, []);

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
          metricsRef.current?.recordResponseCancelled(null, "manual_end_practice");
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
        micMonitorRef.current?.stop();
        micMonitorRef.current = null;
        logStage("realtime_closed");

        // Finalize and best-effort persist the objective timing/interruption measurement layer,
        // plus Phase 4A's speech-delivery evidence (speaking rate, pauses, filler candidates,
        // relative intensity). Deliberately isolated in its own try/catch: a metrics/evidence
        // failure must never block or affect the transcript flush / /api/practice/end call below
        // (see /docs/DECISIONS.md).
        try {
          const snapshot = metricsRef.current?.finalize() ?? null;
          const deliverySnapshot = speechDeliveryRef.current?.finalize() ?? { pauses: [], turnIntensity: [] };
          if (snapshot) {
            const { userTurns, pauses, sessionPauseAggregates, invariantViolations } = mergeSpeechDeliveryEvidence(
              snapshot,
              deliverySnapshot,
            );
            if (invariantViolations.length > 0) {
              // Never used to clamp/reject data — see mergeSpeechDeliveryEvidence.ts's doc comment.
              // A violation here means a clock-origin/lifecycle bug, not a legitimate edge case.
              console.error("[voice:realtime:speech-delivery] pause clock-origin invariant violation(s) — see /docs/DECISIONS.md", invariantViolations);
            }

            for (const line of formatSessionTimelineDebugLines(snapshot)) {
              console.debug("[voice:realtime:metrics]", line);
            }
            for (const line of formatSpeechDeliveryDebugLines(userTurns, pauses, snapshot.fillerCandidates)) {
              console.debug("[voice:realtime:speech-delivery]", line);
            }

            const payload: MetricsPayload = {
              sessionId,
              userTurns,
              aiTurns: snapshot.aiTurns,
              overlaps: snapshot.overlaps,
              confirmedBargeIns: snapshot.confirmedBargeIns,
              pauses,
              fillerCandidates: snapshot.fillerCandidates,
              session: { ...snapshot.session, ...sessionPauseAggregates },
            };
            await postJson("/api/simulation/realtime/metrics", payload);
          }
        } catch (error) {
          console.error(
            "[voice:realtime] failed to persist timing metrics (transcript/evaluation unaffected)",
            error instanceof Error ? error.message : error,
          );
        }

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
    // A genuine reconnect restarts the audio pipeline from scratch (fresh WebRTC connection, echo
    // cancellation re-adapting against newly-started output), so the startup-specific protection
    // applies again, not just on the very first connection attempt of the session.
    isFirstAiResponseRef.current = true;
    firstAiAudioStartAtRef.current = null;
    // A stale connection's AI audio (if any) is gone once we reconnect — never let a leftover
    // `true` from a previous, now-abandoned connection attempt affect this one's state decisions.
    aiAudioPlayingRef.current = false;
    // Cancel any still-pending confirmation timer from a previous, now-abandoned connection attempt
    // before creating a new bargeIn controller for this one — see bargeInRef's own doc comment.
    bargeInRef.current?.reset();
    // Same reasoning as bargeInRef — a previous connection attempt's mic-energy monitor must not
    // keep pushing samples into the (session-spanning) speechDeliveryRef after its own stream/
    // AudioContext is gone.
    micMonitorRef.current?.stop();
    micMonitorRef.current = null;

    try {
      const { clientSecret, openingLine } = await postJson<{ clientSecret: string; openingLine: string }>(
        "/api/simulation/realtime/session",
        { sessionId },
      );

      // Makes the actual interrupt decision instead of trusting the API's own interrupt_response
      // (disabled server-side, see session.ts) — a single VAD start event while the AI is talking
      // is exactly the acoustic-echo failure mode reported in production, so this only treats it
      // as genuine barge-in once speech has persisted for a short confirmation window.
      const bargeIn = createBargeInController({
        confirmMs: () => {
          if (!isFirstAiResponseRef.current) return DEFAULT_BARGE_IN_CONFIRM_MS;
          const elapsed = firstAiAudioStartAtRef.current ? Date.now() - firstAiAudioStartAtRef.current : null;
          return computeStartupConfirmMs(elapsed);
        },
        onImmediateSpeechStart: () => {
          dispatch({ type: "USER_STARTED_SPEAKING" });
        },
        onConfirmedBargeIn: () => {
          if (aiAudioSpeechIncidentRef.current) aiAudioSpeechIncidentRef.current.wasInterrupted = true;
          connection.sendEvent({ type: "response.cancel" });
          logRealtimeDebugEvent(sessionId, "response_cancelled", sessionElapsedMs(), { reason: "confirmed_bargein" });
          // response.cancel alone stops the server from generating further content but does NOT
          // itself drain/stop the output audio buffer — without this, a genuinely interrupted
          // response's output_audio_buffer.stopped can arrive very late or never, leaving its AI
          // turn open for the rest of the session (see sessionTimeline.ts's doc comment on closing
          // an AI turn reliably, and /docs/DECISIONS.md).
          connection.sendEvent({ type: "output_audio_buffer.clear" });
          logRealtimeDebugEvent(sessionId, "output_audio_buffer_clear_sent", sessionElapsedMs(), { reason: "confirmed_bargein" });
          metricsRef.current?.recordConfirmedBargeIn();
          metricsRef.current?.recordResponseCancelled(null, "confirmed_bargein");
          dispatch({ type: "USER_STARTED_SPEAKING" });
        },
        onSpeechStoppedAfterReport: () => {
          pendingUserTranscriptionRef.current = true;
          // Real concurrent evidence, not a guess: if AI audio is already, actually playing at
          // this exact instant, the state machine resolves to "speaking" instead of "thinking" —
          // see connectionState.ts's own doc comment and /docs/DECISIONS.md "State-machine race:
          // Thinking shown during audible AI playback".
          dispatch({ type: "USER_STOPPED_SPEAKING", aiSpeaking: aiAudioPlayingRef.current });
        },
      });
      bargeInRef.current = bargeIn;

      const connection = await connectRealtimeSession(clientSecret, {
        onRemoteTrack: (stream) => {
          if (remoteAudioRef.current) remoteAudioRef.current.srcObject = stream;
        },
        onMicTrackSettings: (settings) => {
          micSettingsRef.current = settings;
          logRealtimeDebugEvent(sessionId, "mic_track_settings", sessionElapsedMs(), { settings });
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
                logRealtimeDebugEvent(sessionId, "response_create_sent", sessionElapsedMs(), { reason: "opening_line" });
              }
              dispatch({ type: "CONNECTED" });
              break;
            }
            case "input_audio_buffer.speech_started": {
              const aiWasSpeaking = stateRef.current === "speaking";
              const isFirst = isFirstAiResponseRef.current;
              const itemId = String(event.item_id ?? "");
              logRealtimeDebugEvent(sessionId, "speech_started", sessionElapsedMs(), {
                itemId,
                uiState: stateRef.current,
                aiAudioPlaying: aiWasSpeaking,
                isFirstAiResponse: isFirst,
              });
              // audio_start_ms is the server's own VAD boundary timestamp — the most precise
              // signal available for this turn's eventual duration (see sessionTimeline.ts).
              metricsRef.current?.recordUserSpeechStarted(
                itemId,
                typeof event.audio_start_ms === "number" ? event.audio_start_ms : null,
              );
              // Phase 4A evidence collection must never block or break Realtime lifecycle
              // processing (see /docs/DECISIONS.md "Response-stall incident", Part C) — isolated in
              // its own try/catch, unlike the trivially-safe sessionTimeline.ts call above, since
              // this is the specific module audited for that risk. A failure here only means this
              // turn's pause/intensity evidence is absent, never a broken conversation.
              safeCall(
                () => speechDeliveryRef.current?.openTurn(itemId),
                (error) => console.error("[voice:realtime:speech-delivery] openTurn failed (conversation unaffected)", error instanceof Error ? error.message : error),
              );
              if (aiWasSpeaking) {
                const sinceFirstAiAudioMs = firstAiAudioStartAtRef.current ? Date.now() - firstAiAudioStartAtRef.current : null;
                aiAudioSpeechIncidentRef.current = {
                  startedAt: Date.now(),
                  wasInterrupted: false,
                  isFirstAiResponse: isFirst,
                  confirmMsUsed: isFirst ? computeStartupConfirmMs(sinceFirstAiAudioMs) : DEFAULT_BARGE_IN_CONFIRM_MS,
                  sessionElapsedMs: Date.now() - sessionMountedAtRef.current,
                  sinceFirstAiAudioMs,
                };
              } else {
                aiAudioSpeechIncidentRef.current = null;
              }
              bargeIn.handleSpeechStarted();
              break;
            }
            case "input_audio_buffer.speech_stopped": {
              const itemId = String(event.item_id ?? "");
              logRealtimeDebugEvent(sessionId, "speech_stopped", sessionElapsedMs(), { itemId });
              const incident = aiAudioSpeechIncidentRef.current;
              if (incident) {
                logRealtimeDebugEvent(sessionId, "speech_started_during_ai_audio", sessionElapsedMs(), {
                  durationMs: Date.now() - incident.startedAt,
                  wasInterrupted: incident.wasInterrupted,
                  isFirstAiResponse: incident.isFirstAiResponse,
                  confirmMsUsed: incident.confirmMsUsed,
                  sinceFirstAiAudioMs: incident.sinceFirstAiAudioMs,
                  // Only worth the extra log volume for the one turn we're actually diagnosing.
                  micSettings: incident.isFirstAiResponse ? micSettingsRef.current : undefined,
                });
              }
              metricsRef.current?.recordUserSpeechStopped(
                itemId,
                typeof event.audio_end_ms === "number" ? event.audio_end_ms : null,
              );
              safeCall(
                () => speechDeliveryRef.current?.closeTurn(itemId),
                (error) => console.error("[voice:realtime:speech-delivery] closeTurn failed (conversation unaffected)", error instanceof Error ? error.message : error),
              );
              bargeIn.handleSpeechStopped();
              // The server auto-creates a response for this turn (turn_detection.create_response:
              // true, see session.ts) — there is no explicit client-sent response.create to log for
              // ordinary voice turn-taking, so this marker makes the EXPECTATION of one visible,
              // letting a future reproduction tell "no response.created ever followed" apart from
              // every other outcome just by scanning forward in this log stream for the next
              // ai_response_created (or its absence) against this same itemId/timestamp.
              logRealtimeDebugEvent(sessionId, "automatic_response_expected", sessionElapsedMs(), { triggeringItemId: itemId });
              break;
            }
            case "conversation.item.input_audio_transcription.completed": {
              pendingUserTranscriptionRef.current = false;
              const transcript = String(event.transcript ?? "").trim();
              logRealtimeDebugEvent(sessionId, "user_transcription_completed", sessionElapsedMs(), {
                itemId: String(event.item_id ?? ""),
                hasMeaningfulTranscript: transcript.length > 0,
                followsSpeechDuringAiAudio: aiAudioSpeechIncidentRef.current !== null,
                isFirstAiResponse: aiAudioSpeechIncidentRef.current?.isFirstAiResponse ?? false,
              });
              aiAudioSpeechIncidentRef.current = null;
              // Recorded even when empty — a completed transcription with no text is itself
              // classification evidence (see sessionTimeline.ts), distinct from no completion event
              // ever arriving at all. Only a non-empty transcript is actually persisted below.
              metricsRef.current?.recordUserTranscript(String(event.item_id ?? ""), transcript);
              if (transcript) void enqueueTranscript("user", transcript);
              break;
            }
            case "conversation.item.input_audio_transcription.failed":
              pendingUserTranscriptionRef.current = false;
              logRealtimeDebugEvent(sessionId, "user_transcription_failed", sessionElapsedMs(), {
                itemId: String(event.item_id ?? ""),
                followsSpeechDuringAiAudio: aiAudioSpeechIncidentRef.current !== null,
                isFirstAiResponse: aiAudioSpeechIncidentRef.current?.isFirstAiResponse ?? false,
              });
              metricsRef.current?.recordUserTranscriptionFailed(String(event.item_id ?? ""));
              aiAudioSpeechIncidentRef.current = null;
              console.error("[voice:realtime] user speech transcription failed (turn continues)", event.error);
              break;
            case "response.created": {
              // Fires before ANY audio (see the doc comment in bargeIn.ts) — marking the AI as
              // "speaking" here, not only once output_audio_buffer.started arrives, closes a real
              // gap: media (SRTP) and data-channel events aren't guaranteed to be processed in
              // the same order, so audio could otherwise start reaching the speaker fractionally
              // before our own state caught up, during which an echo-triggered speech_started
              // would bypass the confirmation window entirely.
              const responseId = (event.response as { id?: string } | undefined)?.id;
              logRealtimeDebugEvent(sessionId, "ai_response_created", sessionElapsedMs(), {
                responseId,
                isFirstAiResponse: isFirstAiResponseRef.current,
              });
              bargeIn.handleAiSpeakingChanged(true);
              // Lets a confirmed barge-in that lands before this response ever produces audio
              // still be attributed to it instead of recording a null aiResponseId — see
              // sessionTimeline.ts's doc comment on this exact gap.
              if (responseId) metricsRef.current?.recordResponseCreated(responseId);
              break;
            }
            case "response.output_audio.delta": {
              // Only the FIRST delta per response is logged — deltas can stream many times per
              // response, and this is a one-shot lifecycle marker ("output has genuinely begun
              // generating"), not a per-chunk trace. Distinguishes "response created but no output"
              // from "output generated but playback never started" (output_audio_buffer.started can
              // itself lag behind the first delta — see /docs/DECISIONS.md "Response-stall
              // incident", Part F).
              const responseId = event.response_id as string | undefined;
              if (responseId && !respondedWithFirstDeltaRef.current.has(responseId)) {
                respondedWithFirstDeltaRef.current.add(responseId);
                logRealtimeDebugEvent(sessionId, "first_output_audio_delta", sessionElapsedMs(), { responseId });
              }
              break;
            }
            case "response.done": {
              // Always emitted, regardless of outcome (completed/cancelled/failed) — the reliable
              // backstop for clearing "AI is speaking" even if a response never actually produced
              // any audio at all, so this flag can never get stuck true from response.created above.
              const response = event.response as { id?: string; status?: string } | undefined;
              logRealtimeDebugEvent(sessionId, "ai_response_done", sessionElapsedMs(), {
                responseId: response?.id,
                status: response?.status,
                isFirstAiResponse: isFirstAiResponseRef.current,
              });
              bargeIn.handleAiSpeakingChanged(false);
              if (response?.id && response.status) {
                metricsRef.current?.recordResponseDone(response.id, response.status as AiResponseStatus);
              }
              // Lifecycle-proven recovery (see /docs/DECISIONS.md "Response-stall incident", Part
              // B/G, and connectionState.ts's own doc comment on this transition): if we are still
              // "thinking" (waiting for a reply) and THIS response has now definitively concluded
              // without ever completing normally, there is nothing left to wait for from it — stop
              // showing "Thinking". Not a retry: no response.create is sent here. A "completed"
              // response never needs this, since output_audio_buffer.stopped already dispatched
              // AI_STARTED_SPEAKING/AI_FINISHED_SPEAKING for it.
              if (stateRef.current === "thinking" && response?.status && response.status !== "completed") {
                dispatch({ type: "AI_FINISHED_SPEAKING" });
              }
              break;
            }
            case "output_audio_buffer.started": {
              if (firstAiAudioStartAtRef.current === null) firstAiAudioStartAtRef.current = Date.now();
              const responseId = event.response_id as string | undefined;
              logRealtimeDebugEvent(sessionId, "ai_audio_started", sessionElapsedMs(), {
                responseId,
                isFirstAiResponse: isFirstAiResponseRef.current,
              });
              aiAudioPlayingRef.current = true;
              bargeIn.handleAiSpeakingChanged(true);
              dispatch({ type: "AI_STARTED_SPEAKING" });
              if (responseId) metricsRef.current?.recordAiAudioStarted(responseId);
              break;
            }
            case "output_audio_buffer.stopped": {
              const responseId = event.response_id as string | undefined;
              logRealtimeDebugEvent(sessionId, "ai_audio_completed", sessionElapsedMs(), { responseId, isFirstAiResponse: isFirstAiResponseRef.current });
              aiAudioPlayingRef.current = false;
              bargeIn.handleAiSpeakingChanged(false);
              dispatch({ type: "AI_FINISHED_SPEAKING" });
              if (responseId) metricsRef.current?.recordAiAudioStopped(responseId);
              // The startup-specific protection only ever applies to this one, first AI turn —
              // every turn after it reverts to the normal, shorter confirmation window.
              isFirstAiResponseRef.current = false;
              break;
            }
            case "output_audio_buffer.cleared": {
              // Fires when the output audio buffer is explicitly cleared (our own
              // output_audio_buffer.clear sent on a confirmed barge-in, above) rather than having
              // naturally drained — the server-confirmed signal that this response's audio was cut
              // off. Closes the AI turn exactly like output_audio_buffer.stopped, so an interrupted
              // turn never stays open until session finalize (see sessionTimeline.ts's doc comment).
              const responseId = event.response_id as string | undefined;
              logRealtimeDebugEvent(sessionId, "ai_audio_cleared", sessionElapsedMs(), { responseId, isFirstAiResponse: isFirstAiResponseRef.current });
              aiAudioPlayingRef.current = false;
              bargeIn.handleAiSpeakingChanged(false);
              dispatch({ type: "AI_FINISHED_SPEAKING" });
              if (responseId) metricsRef.current?.recordAiAudioCleared(responseId);
              isFirstAiResponseRef.current = false;
              break;
            }
            case "response.output_audio_transcript.done": {
              const transcript = String(event.transcript ?? "").trim();
              const responseId = event.response_id as string | undefined;
              // Recorded in the turn metric even for the opening line — a real AI turn with real
              // timing either way; only the conversation_messages persistence below is skipped for
              // it (already written at session creation, see src/lib/practice/actions.ts).
              if (responseId && transcript) metricsRef.current?.recordAiTranscript(responseId, transcript);

              // The very first AI turn is the scenario's opening line, already persisted at
              // session creation — skip it here to avoid a duplicate.
              if (!openingLineTranscriptSkippedRef.current) {
                openingLineTranscriptSkippedRef.current = true;
                break;
              }
              if (transcript) void enqueueTranscript("interlocutor", transcript);
              break;
            }
            case "error":
              console.error("[voice:realtime] server-reported error (session continues)", event.error);
              // Also routed through the structured debug stream (with session-elapsed timing and
              // current uiState) so an error is correlatable against every other lifecycle event —
              // previously this was console.error-only, invisible in the same timeline. Note this
              // event alone never clears "thinking"/any UI state — see the module doc comment on
              // THINKING_STALL_TIMEOUT_MS and /docs/DECISIONS.md "Response-stall incident", Part B.
              logRealtimeDebugEvent(sessionId, "realtime_error", sessionElapsedMs(), {
                uiState: stateRef.current,
                error: event.error,
              });
              break;
            default:
              break;
          }
        },
      });

      connectionRef.current = connection;

      // Phase 4A: attach the live mic-energy analyser to this connection's own local stream. Never
      // the remote/AI audio — see micEnergyMonitor.ts's doc comment on what it does and does not
      // touch. Best-effort: a failure here (e.g. Web Audio unsupported) must not break the voice
      // conversation itself, only leave pause/intensity evidence absent for this connection.
      try {
        micMonitorRef.current = startMicEnergyMonitor(connection.localStream, (rms) => {
          // This callback runs on its own setInterval tick, entirely outside the Realtime
          // onServerEvent handler — but is still wrapped defensively, since an uncaught throw here
          // could otherwise surface as a noisy unhandled-error report with no other benefit (see
          // /docs/DECISIONS.md "Response-stall incident", Part C).
          safeCall(
            () => speechDeliveryRef.current?.pushEnergySample(rms),
            (error) => console.error("[voice:realtime:speech-delivery] pushEnergySample failed (conversation unaffected)", error instanceof Error ? error.message : error),
          );
        });
      } catch (error) {
        console.error("[voice:realtime] mic energy monitor failed to start (conversation unaffected)", error instanceof Error ? error.message : error);
      }
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
  }, [sessionId, enqueueTranscript, sessionElapsedMs]);

  useEffect(() => {
    metricsRef.current = createSessionTimeline();
    speechDeliveryRef.current = createSpeechDeliveryTracker();
    void connect();
    return () => {
      connectionRef.current?.close();
      connectionRef.current = null;
      bargeInRef.current?.reset();
      micMonitorRef.current?.stop();
      micMonitorRef.current = null;
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

  // Response-stall watchdog — see THINKING_STALL_TIMEOUT_MS's doc comment and /docs/DECISIONS.md
  // "Response-stall incident", Part G. Deliberately NOT an automatic response.create retry: current
  // Realtime semantics give the client no way to confirm whether a response is still silently
  // active server-side (no state-query capability over this transport), so blindly sending another
  // response.create risks a duplicate/overlapping AI reply if the "stuck" one eventually resolves
  // on its own. Instead this only surfaces a recovery affordance (reveals the existing "type
  // instead" text fallback and an explanatory notice) and logs a diagnostic — the human decides
  // whether to keep waiting or switch to text, rather than the client guessing.
  useEffect(() => {
    setThinkingStallDetected(false);
    if (state !== "thinking") return;
    const timeout = setTimeout(() => {
      logRealtimeDebugEvent(sessionId, "thinking_stall_detected", sessionElapsedMs(), {
        thinkingStallTimeoutMs: THINKING_STALL_TIMEOUT_MS,
      });
      setThinkingStallDetected(true);
      setShowTextFallback(true);
    }, THINKING_STALL_TIMEOUT_MS);
    return () => clearTimeout(timeout);
  }, [state, sessionId, sessionElapsedMs]);

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
    logRealtimeDebugEvent(sessionId, "response_create_sent", sessionElapsedMs(), { reason: "text_fallback" });
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

      {thinkingStallDetected && state === "thinking" ? (
        <div className="mb-3 flex flex-col items-center gap-1 rounded-xl bg-surface-muted px-4 py-3 text-center text-sm text-foreground-muted">
          <span>{aiLabel} is taking longer than usual to respond. You can keep waiting, or type your response instead.</span>
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
