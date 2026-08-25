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
 */

export type TurnDurationSource = "server_vad" | "client_playback";
export type AiResponseStatus = "completed" | "cancelled" | "failed" | "incomplete" | "in_progress";

export interface UserTurnMetric {
  turnIndex: number;
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

export interface ConfirmedBargeInMetric {
  atMs: number;
  aiResponseId: string | null;
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
  confirmedInterruptionCount: number;
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
  turnIndex: number;
  itemId: string;
  startMs: number;
  endMs: number | null;
  serverAudioStartMs: number | null;
  serverAudioEndMs: number | null;
  transcript: string | null;
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
  recordUserTranscript(itemId: string, transcript: string): void;
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

  return {
    recordUserSpeechStarted(itemId, serverAudioStartMs = null) {
      if (userTurnsByItemId.has(itemId)) return; // duplicate event guard
      userTurnsByItemId.set(itemId, {
        turnIndex: userTurnOrder.length + 1,
        itemId,
        startMs: elapsed(),
        endMs: null,
        serverAudioStartMs,
        serverAudioEndMs: null,
        transcript: null,
      });
      userTurnOrder.push(itemId);
    },

    recordUserSpeechStopped(itemId, serverAudioEndMs = null) {
      const turn = userTurnsByItemId.get(itemId);
      if (!turn || turn.endMs !== null) return; // no matching start, or already stopped
      turn.endMs = elapsed();
      turn.serverAudioEndMs = serverAudioEndMs;
    },

    recordUserTranscript(itemId, transcript) {
      const turn = userTurnsByItemId.get(itemId);
      if (turn) turn.transcript = transcript;
    },

    recordAiAudioStarted(responseId) {
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
      const turn = aiTurnsByResponseId.get(responseId);
      if (!turn) return;
      turn.responseStatus = status;
      if (status === "cancelled") turn.wasInterrupted = true;
    },

    recordConfirmedBargeIn() {
      confirmedBargeIns.push({ atMs: elapsed(), aiResponseId: currentAiResponseId });
      const turn = currentAiResponseId ? aiTurnsByResponseId.get(currentAiResponseId) : null;
      if (turn) turn.wasInterrupted = true;
    },

    recordResponseCancelled(responseId, reason) {
      responseCancellations.push({ atMs: elapsed(), responseId, reason });
    },

    finalize(): SessionTimelineSnapshot {
      const finalizedAtMs = elapsed();

      // Close any still-open turn at the finalize instant (e.g. manual End Practice, which — unlike
      // graceful timer completion — doesn't wait for the in-flight exchange to finish) so every
      // turn has a well-defined duration and nothing is silently dropped from the counts.
      const userTurns: UserTurnMetric[] = userTurnOrder.map((itemId) => {
        const t = userTurnsByItemId.get(itemId)!;
        const endMs = t.endMs ?? finalizedAtMs;
        const hasServerTiming = t.serverAudioStartMs !== null && t.serverAudioEndMs !== null;
        const durationMs = hasServerTiming ? t.serverAudioEndMs! - t.serverAudioStartMs! : endMs - t.startMs;
        return {
          turnIndex: t.turnIndex,
          itemId: t.itemId,
          startMs: t.startMs,
          endMs,
          durationMs,
          durationSource: hasServerTiming ? "server_vad" : "client_playback",
          endedBySessionClose: t.endMs === null,
          serverAudioStartMs: t.serverAudioStartMs,
          serverAudioEndMs: t.serverAudioEndMs,
          transcript: t.transcript,
        };
      });

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

      // Overlap: objective intersection between a user speech interval and an AI playback
      // interval, computed on the shared client clock. Deliberately never called "interruption" —
      // that's the separate, confirmed-barge-in-derived signal above.
      const overlaps: OverlapIntervalMetric[] = [];
      for (const u of userTurns) {
        for (const a of aiTurns) {
          const start = Math.max(u.startMs, a.startMs);
          const end = Math.min(u.endMs, a.endMs);
          if (end > start) {
            overlaps.push({ startMs: start, endMs: end, durationMs: end - start, userItemId: u.itemId, aiResponseId: a.responseId });
          }
        }
      }

      // Response latency: for each user turn, the immediately preceding AI turn that finished
      // strictly before this one started (no overlap — an overlapping pair is a barge-in/overlap,
      // not ordinary latency, per the product requirement).
      const userResponseLatencies: number[] = [];
      for (const u of userTurns) {
        const precedingAi = aiTurns
          .filter((a) => a.endMs <= u.startMs)
          .reduce<AiTurnMetric | null>((latest, a) => (!latest || a.endMs > latest.endMs ? a : latest), null);
        if (precedingAi) userResponseLatencies.push(u.startMs - precedingAi.endMs);
      }

      // AI ("system") response latency: symmetric, but explicitly a product-quality signal, never
      // used to judge the user — see the module doc comment and /docs/DECISIONS.md.
      const aiResponseLatencies: number[] = [];
      for (const a of aiTurns) {
        const precedingUser = userTurns
          .filter((u) => u.endMs <= a.startMs)
          .reduce<UserTurnMetric | null>((latest, u) => (!latest || u.endMs > latest.endMs ? u : latest), null);
        if (precedingUser) aiResponseLatencies.push(a.startMs - precedingUser.endMs);
      }

      const totalUserSpeakingMs = userTurns.reduce((sum, t) => sum + t.durationMs, 0);
      const totalAiSpeakingMs = aiTurns.reduce((sum, t) => sum + t.durationMs, 0);
      const totalOverlapMs = overlaps.reduce((sum, o) => sum + o.durationMs, 0);

      const session: SessionLevelMetrics = {
        totalDurationMs: finalizedAtMs,
        userTurnCount: userTurns.length,
        aiTurnCount: aiTurns.length,
        totalUserSpeakingMs,
        totalAiSpeakingMs,
        userSpeakingPercentage: finalizedAtMs > 0 ? (totalUserSpeakingMs / finalizedAtMs) * 100 : 0,
        aiSpeakingPercentage: finalizedAtMs > 0 ? (totalAiSpeakingMs / finalizedAtMs) * 100 : 0,
        totalOverlapMs,
        overlapCount: overlaps.length,
        confirmedInterruptionCount: confirmedBargeIns.length,
        avgUserTurnDurationMs: average(userTurns.map((t) => t.durationMs)),
        longestUserTurnMs: userTurns.length > 0 ? Math.max(...userTurns.map((t) => t.durationMs)) : null,
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
    lines.push(`User turn ${t.turnIndex}: start ${toS(t.startMs)}s / end ${toS(t.endMs)}s / duration ${toS(t.durationMs)}s`);
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
  lines.push(`Confirmed barge-in: ${snapshot.confirmedBargeIns.length > 0 ? `true (${snapshot.confirmedBargeIns.length})` : "false"}`);
  lines.push(`Overlap: ${snapshot.overlaps.length} interval(s), ${toS(snapshot.session.totalOverlapMs)}s total`);

  return lines;
}
