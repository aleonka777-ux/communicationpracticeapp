/**
 * Objective conversational timing + interruption measurement layer for a Realtime practice
 * session. This is a measurement layer only — it derives numerical timing/overlap facts, never
 * emotional/vocal/psychological claims, and never stores or touches raw audio. See
 * /docs/DECISIONS.md "Realtime timing metrics" for the full design rationale, including the
 * event-source audit this is built from.
 *
 * Event sources (verified against the installed `openai` SDK's Realtime event types — see
 * node_modules/openai/resources/realtime/realtime.d.ts):
 * - User turn boundaries: `input_audio_buffer.speech_started` / `.speech_stopped`. Both carry a
 *   server-authoritative `audio_start_ms` / `audio_end_ms` (ms since the input audio buffer began
 *   receiving audio for the session) and a shared `item_id` — the single most precise, duplicate-
 *   safe signal available, so user TURN DURATION prefers `audio_end_ms - audio_start_ms` over any
 *   client-derived timing.
 * - AI turn boundaries: `output_audio_buffer.started` / `.stopped` (WebRTC/SIP-only events,
 *   documented as bracketing when the server is actively streaming output audio to the client —
 *   the closest available signal to "what the user actually hears," closer than
 *   `response.created`/`response.done`, which reflect response *generation*, not playback).
 *   Neither carries an embedded timestamp, only `response_id` — so AI turn timing is necessarily
 *   client-receipt-based (this monotonic clock), which is also why cross-boundary metrics that mix
 *   user and AI timestamps (response latency, overlap) use this same client clock throughout
 *   rather than mixing it with the server's separate `audio_start_ms`/`audio_end_ms` clock, which
 *   has no established offset relative to it.
 * - AI turn text: `response.output_audio_transcript.done` (`response_id` + `item_id`).
 * - Confirmed user interruption: the existing barge-in controller's `onConfirmedBargeIn` callback
 *   (src/lib/realtime/bargeIn.ts) — deliberately NOT every raw `speech_started`, since false
 *   VAD/echo events are already known to occur and must not count as interruptions.
 * - AI turn outcome: `response.done`'s `response.status` (`completed`/`cancelled`/`failed`/
 *   `incomplete`) — the server's own authoritative record of whether a turn was cut short.
 *
 * The response.created -> output_audio_buffer.started gap: `bargeIn.ts` deliberately treats the AI
 * as "speaking" from `response.created` onward (see its own doc comment — this closes a real
 * media/data-channel ordering race), which is EARLIER than this module's own AiTurnMetric interval
 * (`output_audio_buffer.started` -> `.stopped`, i.e. actual audio playback). A confirmed barge-in
 * can therefore legitimately land in the gap between the two: the server had started generating a
 * response but had not yet produced any audio for it when the user was confirmed to have started
 * talking over it. In that case there is genuinely no audio to have overlapped with — 0 overlap is
 * the CORRECT answer, not a bug — but the confirmation must still be attributable to the response
 * it interrupted rather than silently recording a null aiResponseId. `recordResponseCreated()`
 * tracks this pending (created-but-not-yet-playing) response specifically so
 * `recordConfirmedBargeIn()` can fall back to it when no AiTurnMetric interval exists yet; no
 * AiTurnMetric row is created for a response that never produced audio, since a "turn" here
 * specifically means a period of actual playback (creating one would misrepresent AI speaking time
 * with a phantom zero-duration turn).
 *
 * Technical confirmed barge-in vs. audible user interruption: these are deliberately two different
 * concepts, not two names for the same thing. Every `onConfirmedBargeIn` callback is a real
 * transport/control event — the barge-in controller decided to cancel a pending or active AI
 * response — and is always recorded as a `ConfirmedBargeInMetric` for debugging/session-control
 * visibility (`SessionLevelMetrics.technicalBargeInCount`). But per the gap described above, that
 * cancellation can land BEFORE the response ever produced any audio (`context: "pre_playback"`),
 * in which case the user did not actually speak over anything they could hear — it is not a
 * coaching-relevant interruption. Only a barge-in confirmed while AI audio was actually playing
 * (`context: "audible"`) counts toward `SessionLevelMetrics.confirmedInterruptionCount`, the
 * coaching-facing interruption metric. Overlap remains independent of both: it is always the
 * objective intersection of a confirmed user-speech interval and an actual AI-playback interval,
 * regardless of which barge-in context (if any) accompanied it.
 *
 * User-speech-event classification: a raw `speech_started` -> `speech_stopped` pair is NOT by
 * itself evidence that a real user communication turn occurred — production testing has confirmed
 * false `speech_started` events from speaker echo. Every such event is classified as either
 * "confirmed" (a real turn) or "suspected_noise" (excluded from all derived turn/speaking-time/
 * latency/overlap metrics) using, in priority order:
 *   1. It triggered a confirmed barge-in (src/lib/realtime/bargeIn.ts) -> always "confirmed",
 *      regardless of transcript state — a sustained, confirmed interruption is unambiguous
 *      evidence of real speech on its own. This is a purely retrospective metrics decision; it
 *      does not gate or delay the live barge-in behavior itself.
 *   2. It has a non-empty transcript -> "confirmed". Meaningful transcript text ("yes", "no",
 *      "why?") is direct evidence of real speech regardless of how short the utterance was — short
 *      genuine replies must never be discarded just for being brief.
 *   3. Transcription explicitly failed, or explicitly completed with empty text -> "suspected_
 *      noise". The server's own transcriber concluding there was no speech to transcribe is strong
 *      negative evidence, independent of duration.
 *   4. Otherwise (no transcript ever arrived — still pending, or lost) -> fall back to duration,
 *      the only remaining evidence, via `AMBIGUOUS_NO_TRANSCRIPT_MIN_MS`. OpenAI's default
 *      `silence_duration_ms` (500ms, left unset/default in session.ts) means the server already
 *      waits ~500ms of silence before emitting `speech_stopped`, so genuine turns are rarely this
 *      short — but this path errs toward keeping anything but the briefest events rather than
 *      inventing certainty duration alone can't provide.
 */

export type TurnDurationSource = "server_vad" | "client_playback";
export type AiResponseStatus = "completed" | "cancelled" | "failed" | "incomplete" | "in_progress";
export type UserSpeechEventClassification = "confirmed" | "suspected_noise";

export interface UserTurnMetric {
  /** Sequential index among CONFIRMED turns only — null for a suspected_noise event, since it is
   *  not part of the numbered conversation. See the classification doc comment above. */
  turnIndex: number | null;
  classification: UserSpeechEventClassification;
  itemId: string;
  startMs: number;
  endMs: number;
  durationMs: number;
  durationSource: TurnDurationSource;
  /** True when the session ended before speech_stopped arrived for this turn. */
  endedBySessionClose: boolean;
  serverAudioStartMs: number | null;
  serverAudioEndMs: number | null;
  transcript: string | null;
  transcriptionFailed: boolean;
}

export interface AiTurnMetric {
  turnIndex: number;
  responseId: string;
  startMs: number;
  endMs: number;
  durationMs: number;
  /** True only when this turn was cut short by a confirmed user barge-in or a response cancellation. */
  wasInterrupted: boolean;
  /** True when the turn never received output_audio_buffer.stopped — the session ended (e.g. manual
   *  End Practice, which doesn't wait for the exchange to finish) while this turn was still open.
   *  Distinct from wasInterrupted: this is about how the DATA ends, not why the AI stopped talking. */
  endedBySessionClose: boolean;
  responseStatus: AiResponseStatus | null;
  transcript: string | null;
}

export interface OverlapIntervalMetric {
  startMs: number;
  endMs: number;
  durationMs: number;
  userItemId: string;
  aiResponseId: string;
}

/**
 * "audible": AI audio was actually playing when the barge-in confirmed — the user spoke over
 * something they could hear; this is the coaching-relevant case.
 * "pre_playback": the response had been created but had not yet produced any audio — a real
 * transport/control cancellation, but not an audible interruption. See the module doc comment.
 */
export type BargeInContext = "audible" | "pre_playback";

export interface ConfirmedBargeInMetric {
  atMs: number;
  aiResponseId: string | null;
  context: BargeInContext;
}

export interface ResponseCancelledMetric {
  atMs: number;
  responseId: string | null;
  reason: string;
}

export interface SessionLevelMetrics {
  totalDurationMs: number;
  userTurnCount: number;
  aiTurnCount: number;
  totalUserSpeakingMs: number;
  totalAiSpeakingMs: number;
  userSpeakingPercentage: number;
  aiSpeakingPercentage: number;
  totalOverlapMs: number;
  overlapCount: number;
  /** Coaching-facing interruption count: confirmed barge-ins with context "audible" ONLY — the
   *  user spoke over AI audio that was actually playing. See the module doc comment. */
  confirmedInterruptionCount: number;
  /** ALL confirmed barge-ins regardless of context (audible + pre_playback) — technical/diagnostic
   *  total, for debugging and session control. Always >= confirmedInterruptionCount. */
  technicalBargeInCount: number;
  /** Raw speech_started/speech_stopped pairs classified suspected_noise and excluded from every
   *  metric above — see the module doc comment. Diagnostic visibility only. */
  suspectedNoiseEventCount: number;
  avgUserTurnDurationMs: number | null;
  longestUserTurnMs: number | null;
  avgAiTurnDurationMs: number | null;
  /** Coaching-relevant: how quickly the user responded once the AI genuinely finished speaking. */
  avgUserResponseLatencyMs: number | null;
  medianUserResponseLatencyMs: number | null;
  longestUserResponseLatencyMs: number | null;
  /** System/product-quality metric ONLY — never a user communication-performance signal. */
  avgAiResponseLatencyMs: number | null;
  medianAiResponseLatencyMs: number | null;
}

export interface SessionTimelineSnapshot {
  totalDurationMs: number;
  userTurns: UserTurnMetric[];
  aiTurns: AiTurnMetric[];
  overlaps: OverlapIntervalMetric[];
  confirmedBargeIns: ConfirmedBargeInMetric[];
  responseCancellations: ResponseCancelledMetric[];
  session: SessionLevelMetrics;
}

interface MutableUserTurn {
  itemId: string;
  startMs: number;
  endMs: number | null;
  serverAudioStartMs: number | null;
  serverAudioEndMs: number | null;
  transcript: string | null;
  transcriptionFailed: boolean;
  /** Set retrospectively by recordConfirmedBargeIn() if this was the open user turn at the moment
   *  of confirmation — see the classification doc comment above (rule 1). */
  triggeredConfirmedBargeIn: boolean;
}

interface MutableAiTurn {
  turnIndex: number;
  responseId: string;
  startMs: number;
  endMs: number | null;
  wasInterrupted: boolean;
  responseStatus: AiResponseStatus | null;
  transcript: string | null;
}

export interface SessionTimelineOptions {
  /** Monotonic clock — defaults to performance.now(). Injectable for deterministic tests. */
  now?: () => number;
}

export interface SessionTimeline {
  recordUserSpeechStarted(itemId: string, serverAudioStartMs?: number | null): void;
  recordUserSpeechStopped(itemId: string, serverAudioEndMs?: number | null): void;
  /** transcript may be an empty string — a completed transcription with no text is itself
   *  classification evidence (see the module doc comment, rule 3), distinct from never receiving
   *  a completion event at all. */
  recordUserTranscript(itemId: string, transcript: string): void;
  recordUserTranscriptionFailed(itemId: string): void;
  /** A response has been created (generation started) but has not necessarily produced any audio
   *  yet — see the module doc comment on the response.created -> output_audio_buffer.started gap. */
  recordResponseCreated(responseId: string): void;
  recordAiAudioStarted(responseId: string): void;
  recordAiAudioStopped(responseId: string): void;
  recordAiTranscript(responseId: string, transcript: string): void;
  recordResponseDone(responseId: string, status: AiResponseStatus): void;
  recordConfirmedBargeIn(): void;
  recordResponseCancelled(responseId: string | null, reason: string): void;
  /** Closes any still-open turn at the current instant, computes overlaps/aggregates, and returns
   *  the full snapshot to persist. Safe to call at most once meaningfully — a second call returns
   *  a fresh (very short) snapshot rather than throwing, so a duplicate finalize can't corrupt data. */
  finalize(): SessionTimelineSnapshot;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** See the module doc comment's classification rule 4 — the last-resort fallback when a user
 *  speech event has no transcript evidence in either direction. */
const AMBIGUOUS_NO_TRANSCRIPT_MIN_MS = 300;

function classifyUserSpeechEvent(turn: {
  durationMs: number;
  transcript: string | null;
  transcriptionFailed: boolean;
  triggeredConfirmedBargeIn: boolean;
}): UserSpeechEventClassification {
  if (turn.triggeredConfirmedBargeIn) return "confirmed";
  const trimmed = turn.transcript?.trim() ?? "";
  if (trimmed.length > 0) return "confirmed";
  const completedEmpty = turn.transcript !== null && trimmed.length === 0;
  if (turn.transcriptionFailed || completedEmpty) return "suspected_noise";
  return turn.durationMs >= AMBIGUOUS_NO_TRANSCRIPT_MIN_MS ? "confirmed" : "suspected_noise";
}

export function createSessionTimeline(options: SessionTimelineOptions = {}): SessionTimeline {
  const now = options.now ?? (() => performance.now());
  const sessionStartMs = now();
  const elapsed = () => now() - sessionStartMs;

  const userTurnsByItemId = new Map<string, MutableUserTurn>();
  const userTurnOrder: string[] = [];
  const aiTurnsByResponseId = new Map<string, MutableAiTurn>();
  const aiTurnOrder: string[] = [];
  const confirmedBargeIns: ConfirmedBargeInMetric[] = [];
  const responseCancellations: ResponseCancelledMetric[] = [];
  let currentAiResponseId: string | null = null;
  /** A response that has received response.created but not yet output_audio_buffer.started — see
   *  the module doc comment on the response.created -> output_audio_buffer.started gap. Cleared
   *  once that response either starts producing audio or concludes without ever doing so. */
  let pendingResponseId: string | null = null;
  /** The user turn currently open (speech_started received, speech_stopped not yet), if any — a
   *  confirmed barge-in can only ever fire while this is set (see bargeIn.ts: a blip that stops
   *  before confirmation never reaches onConfirmedBargeIn), so this is how recordConfirmedBargeIn()
   *  attributes the confirmation back to the specific user turn that earned it. */
  let currentOpenUserItemId: string | null = null;

  return {
    recordUserSpeechStarted(itemId, serverAudioStartMs = null) {
      if (userTurnsByItemId.has(itemId)) return; // duplicate event guard
      userTurnsByItemId.set(itemId, {
        itemId,
        startMs: elapsed(),
        endMs: null,
        serverAudioStartMs,
        serverAudioEndMs: null,
        transcript: null,
        transcriptionFailed: false,
        triggeredConfirmedBargeIn: false,
      });
      userTurnOrder.push(itemId);
      currentOpenUserItemId = itemId;
    },

    recordUserSpeechStopped(itemId, serverAudioEndMs = null) {
      const turn = userTurnsByItemId.get(itemId);
      if (!turn || turn.endMs !== null) return; // no matching start, or already stopped
      turn.endMs = elapsed();
      turn.serverAudioEndMs = serverAudioEndMs;
      if (currentOpenUserItemId === itemId) currentOpenUserItemId = null;
    },

    recordUserTranscript(itemId, transcript) {
      const turn = userTurnsByItemId.get(itemId);
      if (turn) turn.transcript = transcript;
    },

    recordUserTranscriptionFailed(itemId) {
      const turn = userTurnsByItemId.get(itemId);
      if (turn) turn.transcriptionFailed = true;
    },

    recordResponseCreated(responseId) {
      pendingResponseId = responseId;
    },

    recordAiAudioStarted(responseId) {
      if (pendingResponseId === responseId) pendingResponseId = null;
      if (aiTurnsByResponseId.has(responseId)) return;
      aiTurnsByResponseId.set(responseId, {
        turnIndex: aiTurnOrder.length + 1,
        responseId,
        startMs: elapsed(),
        endMs: null,
        wasInterrupted: false,
        responseStatus: null,
        transcript: null,
      });
      aiTurnOrder.push(responseId);
      currentAiResponseId = responseId;
    },

    recordAiAudioStopped(responseId) {
      const turn = aiTurnsByResponseId.get(responseId);
      if (!turn || turn.endMs !== null) return;
      turn.endMs = elapsed();
      if (currentAiResponseId === responseId) currentAiResponseId = null;
    },

    recordAiTranscript(responseId, transcript) {
      const turn = aiTurnsByResponseId.get(responseId);
      if (turn) turn.transcript = transcript;
    },

    recordResponseDone(responseId, status) {
      if (pendingResponseId === responseId) pendingResponseId = null;
      const turn = aiTurnsByResponseId.get(responseId);
      if (!turn) return;
      turn.responseStatus = status;
      if (status === "cancelled") turn.wasInterrupted = true;
    },

    recordConfirmedBargeIn() {
      // Prefer the response actively producing audio; if none is playing yet, fall back to one
      // that has been created but hasn't started playing — see the module doc comment on the
      // response.created -> output_audio_buffer.started gap. This is attribution only: no
      // AiTurnMetric is fabricated for a response that never produced audio.
      const interruptedResponseId = currentAiResponseId ?? pendingResponseId;
      // "audible" iff AI audio was actually playing (currentAiResponseId set); otherwise this is a
      // pre-playback cancellation — a real technical barge-in, but not an audible interruption.
      const context: BargeInContext = currentAiResponseId ? "audible" : "pre_playback";
      confirmedBargeIns.push({ atMs: elapsed(), aiResponseId: interruptedResponseId, context });
      const aiTurn = currentAiResponseId ? aiTurnsByResponseId.get(currentAiResponseId) : null;
      if (aiTurn) aiTurn.wasInterrupted = true;
      // A confirmed barge-in can only ever fire while the triggering user turn is still open (see
      // bargeIn.ts — a blip that stops before confirmation never reaches this callback), so
      // whichever user turn is currently open is unambiguously the one that earned it.
      const userTurn = currentOpenUserItemId ? userTurnsByItemId.get(currentOpenUserItemId) : null;
      if (userTurn) userTurn.triggeredConfirmedBargeIn = true;
    },

    recordResponseCancelled(responseId, reason) {
      responseCancellations.push({ atMs: elapsed(), responseId, reason });
    },

    finalize(): SessionTimelineSnapshot {
      const finalizedAtMs = elapsed();

      // Close any still-open turn at the finalize instant (e.g. manual End Practice, which — unlike
      // graceful timer completion — doesn't wait for the in-flight exchange to finish) so every
      // turn has a well-defined duration and nothing is silently dropped from the counts.
      // Classification happens here, once every turn's final state (transcript, transcription
      // failure, confirmed-barge-in attribution) is known — see the module doc comment. turnIndex
      // is assigned only to "confirmed" turns, in chronological order, since a suspected_noise
      // event is not part of the numbered conversation.
      let confirmedIndex = 0;
      const userTurns: UserTurnMetric[] = userTurnOrder.map((itemId) => {
        const t = userTurnsByItemId.get(itemId)!;
        const endMs = t.endMs ?? finalizedAtMs;
        const hasServerTiming = t.serverAudioStartMs !== null && t.serverAudioEndMs !== null;
        const durationMs = hasServerTiming ? t.serverAudioEndMs! - t.serverAudioStartMs! : endMs - t.startMs;
        const classification = classifyUserSpeechEvent({
          durationMs,
          transcript: t.transcript,
          transcriptionFailed: t.transcriptionFailed,
          triggeredConfirmedBargeIn: t.triggeredConfirmedBargeIn,
        });
        const turnIndex = classification === "confirmed" ? ++confirmedIndex : null;
        return {
          turnIndex,
          classification,
          itemId: t.itemId,
          startMs: t.startMs,
          endMs,
          durationMs,
          durationSource: hasServerTiming ? "server_vad" : "client_playback",
          endedBySessionClose: t.endMs === null,
          serverAudioStartMs: t.serverAudioStartMs,
          serverAudioEndMs: t.serverAudioEndMs,
          transcript: t.transcript,
          transcriptionFailed: t.transcriptionFailed,
        };
      });
      // Everything below derives session-level facts from CONFIRMED user turns only — a
      // suspected_noise event must never contribute to turn counts, speaking time, response
      // latency (in either direction), or overlap. It is still returned in `userTurns` above,
      // unabridged, for diagnostic/audit purposes.
      const confirmedUserTurns = userTurns.filter((t) => t.classification === "confirmed");

      const aiTurns: AiTurnMetric[] = aiTurnOrder.map((responseId) => {
        const t = aiTurnsByResponseId.get(responseId)!;
        const endMs = t.endMs ?? finalizedAtMs;
        return {
          turnIndex: t.turnIndex,
          responseId: t.responseId,
          startMs: t.startMs,
          endMs,
          durationMs: endMs - t.startMs,
          wasInterrupted: t.wasInterrupted,
          endedBySessionClose: t.endMs === null,
          responseStatus: t.responseStatus,
          transcript: t.transcript,
        };
      });

      // Overlap: objective intersection between a CONFIRMED user speech interval and an AI
      // playback interval, computed on the shared client clock. Deliberately never called
      // "interruption" — that's the separate, confirmed-barge-in-derived signal above. A
      // suspected_noise interval is excluded — it was never established as real user speech, so an
      // AI turn happening to play during an echo blip must not be reported as overlap.
      const overlaps: OverlapIntervalMetric[] = [];
      for (const u of confirmedUserTurns) {
        for (const a of aiTurns) {
          const start = Math.max(u.startMs, a.startMs);
          const end = Math.min(u.endMs, a.endMs);
          if (end > start) {
            overlaps.push({ startMs: start, endMs: end, durationMs: end - start, userItemId: u.itemId, aiResponseId: a.responseId });
          }
        }
      }

      // Response latency: for each CONFIRMED user turn, the immediately preceding AI turn that
      // finished strictly before this one started (no overlap — an overlapping pair is a
      // barge-in/overlap, not ordinary latency, per the product requirement).
      const userResponseLatencies: number[] = [];
      for (const u of confirmedUserTurns) {
        const precedingAi = aiTurns
          .filter((a) => a.endMs <= u.startMs)
          .reduce<AiTurnMetric | null>((latest, a) => (!latest || a.endMs > latest.endMs ? a : latest), null);
        if (precedingAi) userResponseLatencies.push(u.startMs - precedingAi.endMs);
      }

      // AI ("system") response latency: symmetric, but explicitly a product-quality signal, never
      // used to judge the user — see the module doc comment and /docs/DECISIONS.md. A suspected
      // noise event must not establish "the user just finished speaking" for this calculation
      // either.
      const aiResponseLatencies: number[] = [];
      for (const a of aiTurns) {
        const precedingUser = confirmedUserTurns
          .filter((u) => u.endMs <= a.startMs)
          .reduce<UserTurnMetric | null>((latest, u) => (!latest || u.endMs > latest.endMs ? u : latest), null);
        if (precedingUser) aiResponseLatencies.push(a.startMs - precedingUser.endMs);
      }

      const totalUserSpeakingMs = confirmedUserTurns.reduce((sum, t) => sum + t.durationMs, 0);
      const totalAiSpeakingMs = aiTurns.reduce((sum, t) => sum + t.durationMs, 0);
      const totalOverlapMs = overlaps.reduce((sum, o) => sum + o.durationMs, 0);
      const audibleBargeIns = confirmedBargeIns.filter((b) => b.context === "audible");

      const session: SessionLevelMetrics = {
        totalDurationMs: finalizedAtMs,
        userTurnCount: confirmedUserTurns.length,
        aiTurnCount: aiTurns.length,
        totalUserSpeakingMs,
        totalAiSpeakingMs,
        userSpeakingPercentage: finalizedAtMs > 0 ? (totalUserSpeakingMs / finalizedAtMs) * 100 : 0,
        aiSpeakingPercentage: finalizedAtMs > 0 ? (totalAiSpeakingMs / finalizedAtMs) * 100 : 0,
        totalOverlapMs,
        overlapCount: overlaps.length,
        confirmedInterruptionCount: audibleBargeIns.length,
        technicalBargeInCount: confirmedBargeIns.length,
        suspectedNoiseEventCount: userTurns.length - confirmedUserTurns.length,
        avgUserTurnDurationMs: average(confirmedUserTurns.map((t) => t.durationMs)),
        longestUserTurnMs: confirmedUserTurns.length > 0 ? Math.max(...confirmedUserTurns.map((t) => t.durationMs)) : null,
        avgAiTurnDurationMs: average(aiTurns.map((t) => t.durationMs)),
        avgUserResponseLatencyMs: average(userResponseLatencies),
        medianUserResponseLatencyMs: median(userResponseLatencies),
        longestUserResponseLatencyMs: userResponseLatencies.length > 0 ? Math.max(...userResponseLatencies) : null,
        avgAiResponseLatencyMs: average(aiResponseLatencies),
        medianAiResponseLatencyMs: median(aiResponseLatencies),
      };

      return { totalDurationMs: finalizedAtMs, userTurns, aiTurns, overlaps, confirmedBargeIns: [...confirmedBargeIns], responseCancellations: [...responseCancellations], session };
    },
  };
}

/** Formats a snapshot into human-readable lines for development/QA use — see debugLog.ts. Seconds, matching the product spec's example. */
export function formatSessionTimelineDebugLines(snapshot: SessionTimelineSnapshot): string[] {
  const toS = (ms: number) => (ms / 1000).toFixed(2);
  const lines: string[] = [];

  for (const t of snapshot.userTurns) {
    if (t.classification === "confirmed") {
      lines.push(`User turn ${t.turnIndex}: start ${toS(t.startMs)}s / end ${toS(t.endMs)}s / duration ${toS(t.durationMs)}s`);
    } else {
      lines.push(
        `Suspected false VAD/noise event (excluded): start ${toS(t.startMs)}s / end ${toS(t.endMs)}s / duration ${toS(t.durationMs)}s / transcript ${t.transcript === null ? "none received" : t.transcript === "" ? "empty" : `"${t.transcript}"`}${t.transcriptionFailed ? " / transcription failed" : ""}`,
      );
    }
  }
  for (const t of snapshot.aiTurns) {
    lines.push(
      `AI turn ${t.turnIndex}: start ${toS(t.startMs)}s / end ${toS(t.endMs)}s / duration ${toS(t.durationMs)}s${t.wasInterrupted ? " (interrupted)" : ""}`,
    );
  }
  if (snapshot.session.avgAiResponseLatencyMs !== null) {
    lines.push(`AI response latency (avg): ${toS(snapshot.session.avgAiResponseLatencyMs)}s`);
  }
  if (snapshot.session.avgUserResponseLatencyMs !== null) {
    lines.push(`User response latency (avg): ${toS(snapshot.session.avgUserResponseLatencyMs)}s`);
  }
  lines.push(
    `Audible user interruption (coaching-relevant): ${snapshot.session.confirmedInterruptionCount > 0 ? `true (${snapshot.session.confirmedInterruptionCount})` : "false"}`,
  );
  lines.push(`Technical confirmed barge-in (all, incl. pre-playback): ${snapshot.session.technicalBargeInCount}`);
  lines.push(`Overlap: ${snapshot.overlaps.length} interval(s), ${toS(snapshot.session.totalOverlapMs)}s total`);
  lines.push(`Suspected false VAD/noise events excluded: ${snapshot.session.suspectedNoiseEventCount}`);

  return lines;
}
