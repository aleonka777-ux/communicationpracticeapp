import { detectFillerCandidates, type FillerCandidate } from "@/lib/realtime/fillerCandidates";

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
 * Closing an AI turn reliably — the actual root cause of AI-speaking-time/overlap/latency blowups
 * seen in production (total_ai_speaking_ms exceeding total_duration_ms, huge spurious overlap,
 * wildly inflated response latency): `response.cancel` alone stops the server from generating
 * further content but does NOT itself drain/stop the OUTPUT AUDIO BUFFER — only an explicit
 * `output_audio_buffer.clear` event (client -> server) or the server's own VAD-mode auto-interrupt
 * (which requires `turn_detection.interrupt_response: true`, disabled here on purpose) does that.
 * The component previously sent `response.cancel` alone on a confirmed barge-in, so a genuinely
 * interrupted response's `output_audio_buffer.stopped` could arrive very late or never at all,
 * leaving that AiTurnMetric open until `finalize()`, where it would be closed with `finalizedAtMs`
 * — giving it a duration spanning most or all of the remaining session. That single bad interval
 * then (a) inflates `totalAiSpeakingMs` past the session's own wall-clock duration, (b) overlaps
 * with essentially every subsequent user turn, inflating overlap count/duration, and (c) gets
 * excluded from "preceding AI turn" searches for response latency (its endMs is too late to
 * qualify as "preceding" anything), forcing latency to be measured against a much older, unrelated
 * AI turn instead. Fixed two ways: (1) the component now also sends `output_audio_buffer.clear`
 * alongside `response.cancel`, and listens for the resulting `output_audio_buffer.cleared` event,
 * closing the AI turn exactly like `.stopped` would; (2) as a safety net independent of that fix,
 * `recordResponseDone()` now closes any AI turn that is still open when the response concludes
 * with any status other than `"completed"` (cancelled/failed/incomplete) — those statuses can never
 * produce further audio, so there is nothing to keep waiting for. Both paths funnel through one
 * idempotent close, so whichever event arrives first wins and the other is a safe no-op.
 *
 * Idempotent audible interruption per AI response: a single deliberate user interruption can
 * legitimately generate more than one raw `speech_started`/`speech_stopped` pair from the server's
 * VAD (a brief pause mid-utterance splits it into two segments), and — before the fix above — a
 * genuinely interrupted response staying artificially "open" could also let a second raw
 * confirmation land against the same still-apparently-active response. Either way, multiple
 * confirmed barge-ins against the SAME AI response represent one underlying interruption of one AI
 * turn, not several. `recordConfirmedBargeIn()` tracks which AI response ids have already produced
 * a counted audible interruption; a repeat confirmation against an already-counted response is
 * still recorded in full (`ConfirmedBargeInMetric`, `technicalBargeInCount`) for diagnostics, but
 * is marked `countsTowardInterruption: false` and excluded from `confirmedInterruptionCount`. This
 * does not assume a transcript proves genuine speech either way — the dedup key is the interrupted
 * AI response, not anything transcript-derived.
 *
 * Classifying audible-vs-pre_playback at speech-START time, not confirmation time: a candidate
 * interruption spans from `input_audio_buffer.speech_started` to the confirmation firing, 250ms
 * later by default — up to ~1.5s during the startup-guard window (see startupGuard.ts). Whether the
 * AI was audibly speaking is a fact about the moment the user's speech interval BEGAN, not a fact
 * to be re-derived from whatever shared mutable state (`currentAiResponseId`/`pendingResponseId`)
 * happens to read at confirmation time — by then the AI's turn may have naturally concluded, been
 * closed for an unrelated reason, or (in a reconnect edge case) a completely different response may
 * be in flight. Re-reading live state at confirmation time would silently misclassify a genuine
 * mid-playback interruption as `"pre_playback"` (or leave it unattributed) purely because time
 * passed between the two moments. `recordUserSpeechStarted()` therefore snapshots
 * `currentAiResponseId`/`pendingResponseId` onto the user turn itself, at the instant speech starts;
 * `recordConfirmedBargeIn()` reads that snapshot (via whichever user turn is currently open) rather
 * than re-deriving the answer from present-tense state. The snapshotted, at-start audible response
 * id is also what gets marked `wasInterrupted` on the AI turn side, and what overlap/latency
 * ultimately reconcile against, so every derived signal agrees on the same moment-in-time answer.
 *
 * The media/data-channel ordering race, part two — WebRTC media (SRTP, carries the actual audio
 * samples) and the Realtime data channel (SCTP, carries `output_audio_buffer.started`) are two
 * different transports multiplexed over the same ICE/DTLS connection, with no guaranteed relative
 * ordering (this is the same class of race `bargeIn.ts` already accounts for between
 * `response.created` and audio reaching the speaker — see its own doc comment). Snapshotting
 * `currentAiResponseId` at `input_audio_buffer.speech_started` time (above) fixes "state moved on
 * by confirmation time," but is still vulnerable to a narrower version of the same race: if the
 * actual audio for a response reaches the user's speakers moments BEFORE the data channel's
 * `output_audio_buffer.started` for that same response has been processed, the user can genuinely
 * already be hearing the AI when they start talking, yet `currentAiResponseId` is still `null` at
 * the exact instant `recordUserSpeechStarted()` snapshots it.
 *
 * A real HTMLMediaElement (`<audio>`, fed by `ontrack`) exists client-side and does expose genuine
 * playback signals (`playing`/`waiting`/`pause`) — these were audited as a candidate authoritative
 * "audio is rendering right now" source. They are not usable here: OpenAI's output track is a
 * single continuous live MediaStream reused across every AI turn in the session, not a discrete
 * file/clip per turn, so the element's `readyState`/`playing`/`waiting` transitions track *network/
 * buffering* health for the whole connection, not per-turn silence between AI responses (the track
 * keeps flowing, silent or not, between turns) — using them would not distinguish "response N's
 * audio is playing" from "the pipe is merely idle." Detecting genuine silence directly would require
 * inspecting decoded audio sample energy (Web Audio API `AnalyserNode`), which is vocal/audio-level
 * analysis, explicitly out of scope for this measurement layer.
 *
 * With no stronger signal available, this is resolved with a small, explicitly bounded, documented
 * reconciliation instead of either extreme (treating every `response.created` as audible — which
 * would defeat the whole `response.created` -> `.started` gap analysis above, per the module's own
 * "we do NOT want to classify all response.created -> speech events as audible" requirement — or
 * trusting the at-start snapshot unconditionally). If a candidate interruption's AI state at
 * speech-start was `"pre_playback"` (a response was pending but not yet marked playing), and that
 * SAME response's `output_audio_buffer.started` is later found to have landed within
 * `MEDIA_DATA_CHANNEL_SKEW_TOLERANCE_MS` AFTER the user's speech began, the two transports are
 * treated as reporting the same real-world event a few ms apart, and the interruption is reclassified
 * `"audible"`. This reconciliation can only run at `finalize()` time, once the full timeline
 * (including any `.started` that arrived shortly after speech began) is known — `recordConfirmedBargeIn()`
 * therefore records the raw evidence (the at-start snapshot, plus the triggering user turn's own
 * `startMs`) rather than resolving `context`/attribution/`wasInterrupted`/dedup immediately; all of
 * that is resolved once, from scratch, inside `finalize()` (never mutating persistent session state,
 * so a duplicate `finalize()` call stays idempotent). A genuinely later response — one that starts
 * playing well outside the tolerance window because it simply had not begun generating audio yet —
 * is correctly left `"pre_playback"`; the tolerance is deliberately far smaller than the 250ms-1.5s
 * confirmation window itself, so it cannot be satisfied by an unrelated response that only started
 * because enough real time had passed, only by two transports narrowly disagreeing about one event.
 *
 * Overlap must have meaningful positive duration to be persisted — production surfaced 2 "overlap"
 * events totaling ~0.5ms in a single session, which is far below any physically meaningful unit of
 * simultaneous human speech. Two independently-timestamped `elapsed()` calls for two different
 * WebRTC data-channel messages can differ by a fraction of a millisecond purely from JS event-loop
 * processing order, never from anything acoustically real — `MIN_MEANINGFUL_OVERLAP_MS` filters
 * these out at the source rather than reporting them as real (if numerically tiny) overlap events.
 *
 * A related, separate correctness note: overlap and response latency intentionally use ONLY the
 * client monotonic clock end to end (`UserTurnMetric.startMs`/`endMs`, `AiTurnMetric.startMs`/
 * `endMs`) — never the server's separate `audio_start_ms`/`audio_end_ms` clock, which has no
 * established offset relative to the client clock (see the AI turn boundaries note above). Mixing
 * the two domains in an interval intersection would produce a meaningless result — including,
 * coincidentally, a near-zero "overlap" if the two clocks happen to be offset by roughly the size of
 * the true overlap. This has been re-verified: `startMs`/`endMs` on both metric types are always
 * `elapsed()`-derived; only `durationMs` for a `server_vad`-timed user turn additionally prefers the
 * server clock for that one figure specifically (see the AI/user turn boundaries note above) and is
 * never used in the overlap/latency interval math itself.
 *
 * Phase 4A — speech-delivery EVIDENCE (speaking rate, filler/disfluency candidates): added at
 * finalize() time, from data this module already has (a confirmed turn's final transcript and
 * duration) — no new event sources, no live audio needed for these two specifically (intra-utterance
 * pauses and relative vocal intensity DO need live audio-energy sampling and live entirely in
 * src/lib/realtime/speechDeliveryTracker.ts + micEnergyMonitor.ts instead, merged into the payload by
 * the client component at post time). This is a measurement layer only, exactly like the timing
 * metrics above: it derives neutral, uninterpreted facts (a word count, a candidate token's
 * position), never a judgment ("too many fillers", "good pause", "nervous"). See
 * /docs/DECISIONS.md "Phase 4A: speech-delivery evidence" for the full audit and design rationale,
 * including why filler-candidate reliability is NOT uniform across categories (see
 * fillerCandidates.ts's own doc comment) and why speaking rate excludes very short turns.
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
  /** The AI response id that was actively playing audio at the instant THIS speech interval began
   *  — captured then, never re-derived later. Null if the AI was not audibly playing at that
   *  moment (though a response may still have been pending — see the module doc comment on
   *  classifying audible-vs-pre_playback at speech-start time). */
  audibleAiResponseIdAtStart: string | null;
  /** Literal whitespace-tokenized count of the transcript ("trim, split on whitespace, drop empty
   *  tokens") — an approximation, not linguistic word segmentation. Null when no transcript text
   *  exists to count (never received, or transcription failed). See the module doc comment on
   *  Phase 4A speech-delivery evidence. */
  wordCount: number | null;
  /** wordCount / (durationMs / 60000). Null whenever wordCount is null, OR wordCount is below
   *  MIN_WORDS_FOR_RATE — a 1-2 word turn's "rate" is dominated by turn-boundary VAD timing noise
   *  (the server's own silence-detection tail baked into every turn boundary), not real articulation
   *  speed, so reporting a number there would manufacture false precision. This is evidence, not a
   *  judgment: no "ideal" WPM is defined or implied anywhere in this module. */
  speakingRateWpm: number | null;
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
  /** False when this is a repeat confirmation against an AI response that has already produced a
   *  counted audible interruption (or when context is "pre_playback") — see the module doc comment
   *  on idempotent audible interruption. Every event is still recorded here regardless, for
   *  diagnostics; only entries with this true count toward SessionLevelMetrics.confirmedInterruptionCount. */
  countsTowardInterruption: boolean;
}

export interface ResponseCancelledMetric {
  atMs: number;
  responseId: string | null;
  reason: string;
}

/** One filler/disfluency CANDIDATE occurrence, attributed back to the confirmed user turn it came
 *  from. See fillerCandidates.ts's own doc comment for what "candidate" deliberately does NOT mean
 *  (a proven filler) and why reliability differs by category. */
export interface FillerCandidateMetric extends FillerCandidate {
  /** Named itemId (not userItemId, unlike OverlapIntervalMetric) to match metricsPayload.ts's
   *  fillerCandidateSchema field name exactly, since this metric is posted through that schema
   *  as-is. */
  itemId: string;
  /** The same turnIndex as the owning UserTurnMetric — always non-null, since candidates are only
   *  ever derived from CONFIRMED turns' transcripts (a suspected_noise turn's transcript, if any, is
   *  not evidence of real speech content). */
  turnIndex: number;
  /** Estimated by linear interpolation across the turn's own [startMs, endMs] span, proportional to
   *  the candidate's position within the transcript string — NOT a measured timestamp, since no
   *  word-level timing is available from the current transcription pipeline (see the module doc
   *  comment). Null only if the turn's transcript was empty (should not occur in practice, since a
   *  candidate implies non-empty transcript text). */
  approxSessionMs: number | null;
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

  // --- Phase 4A: speech-delivery evidence (see the module doc comment). All derived from
  // CONFIRMED user turns only, same exclusion as every metric above. Neutral evidence — no "ideal"
  // WPM, no filler scoring, no interpretation of what a candidate or a rate means.
  /** Turns meeting MIN_WORDS_FOR_RATE only — see UserTurnMetric.speakingRateWpm. */
  avgWordsPerMinute: number | null;
  medianWordsPerMinute: number | null;
  fastestUserTurnWpm: number | null;
  slowestUserTurnWpm: number | null;
  /** Slope of a simple linear regression of WPM against turn order (WPM per turn). Null unless at
   *  least 3 turns meet MIN_WORDS_FOR_RATE — a trend line through fewer than 3 points is not a
   *  meaningful trend. Sign/magnitude only, deliberately not labeled "improving"/"declining". */
  wpmTrendSlopePerTurn: number | null;
  /** See fillerCandidates.ts — best-effort, UNDERCOUNT-ONLY (Whisper-family transcription is known
   *  to inconsistently drop these). Never compare this count against lexicalDiscourseCandidateCount
   *  as if they were equally reliable. */
  vocalDisfluencyCandidateCount: number;
  lexicalDiscourseCandidateCount: number;
  repetitionCandidateCount: number;
  /** (vocal + lexical + repetition candidates) per 100 words of confirmed-turn transcript. Null if
   *  zero words were spoken. */
  candidateRatePer100Words: number | null;
  /** Same numerator, per minute of total confirmed user speaking time. Null if totalUserSpeakingMs
   *  is 0. */
  candidateRatePerMinuteSpeaking: number | null;
}

export interface SessionTimelineSnapshot {
  totalDurationMs: number;
  userTurns: UserTurnMetric[];
  aiTurns: AiTurnMetric[];
  overlaps: OverlapIntervalMetric[];
  confirmedBargeIns: ConfirmedBargeInMetric[];
  responseCancellations: ResponseCancelledMetric[];
  /** Phase 4A evidence — see the module doc comment. Derived only from CONFIRMED user turns. */
  fillerCandidates: FillerCandidateMetric[];
  session: SessionLevelMetrics;
  /** Human-readable descriptions of any structural invariant violated by this snapshot (e.g. AI
   *  speaking time exceeding session duration, overlapping AI turns) — see
   *  validateSessionTimelineInvariants(). Empty in the normal case. Diagnostic only: never persisted,
   *  never used to silently clamp/reject data — a violation means the underlying event lifecycle
   *  has a bug that needs fixing, not that the number should be capped. */
  invariantViolations: string[];
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
  /** Snapshotted at recordUserSpeechStarted() time — see the module doc comment on classifying
   *  audible-vs-pre_playback at speech-start time, not confirmation time. */
  audibleAiResponseIdAtStart: string | null;
  pendingAiResponseIdAtStart: string | null;
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

/**
 * Raw evidence for one recordConfirmedBargeIn() call, recorded as-is at the time it fires.
 * context/attribution/dedup are deliberately NOT resolved here — see the module doc comment on the
 * media/data-channel ordering race, part two — they are resolved once, from scratch, in finalize(),
 * once the full timeline (including any output_audio_buffer.started that arrived shortly after
 * speech began) is known.
 */
interface RawConfirmedBargeIn {
  atMs: number;
  audibleResponseIdAtStart: string | null;
  pendingResponseIdAtStart: string | null;
  /** The triggering user turn's own startMs — the anchor for the tolerance-window reconciliation. */
  triggeringUserStartMs: number;
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
  /** The output audio buffer naturally drained (response completed normally, or already-queued
   *  audio finished playing out after a cancellation). Closes the AI turn if not already closed. */
  recordAiAudioStopped(responseId: string): void;
  /** The output audio buffer was explicitly cleared (client-sent output_audio_buffer.clear, or the
   *  server's own VAD-mode auto-clear) — the server-confirmed signal that this response's audio
   *  has stopped reaching the client because it was cut off, not because it finished. Closes the AI
   *  turn exactly like recordAiAudioStopped if not already closed — see the module doc comment on
   *  closing an AI turn reliably. */
  recordAiAudioCleared(responseId: string): void;
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

/** Literal whitespace tokenization — see UserTurnMetric.wordCount's doc comment. */
function countWords(transcript: string): number {
  const trimmed = transcript.trim();
  if (trimmed.length === 0) return 0;
  return trimmed.split(/\s+/).length;
}

/** A turn shorter than this many words produces a WPM figure dominated by turn-boundary VAD timing
 *  noise rather than real articulation rate — see UserTurnMetric.speakingRateWpm's doc comment. */
const MIN_WORDS_FOR_RATE = 3;

/** Simple ordinary-least-squares slope of y against x = 0..n-1 (turn order). Null for fewer than 3
 *  points — see SessionLevelMetrics.wpmTrendSlopePerTurn's doc comment. */
function linearRegressionSlope(values: number[]): number | null {
  if (values.length < 3) return null;
  const n = values.length;
  const xs = values.map((_, i) => i);
  const xMean = average(xs) as number; // non-null: xs.length === values.length >= 3
  const yMean = average(values) as number;
  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i++) {
    numerator += (xs[i] - xMean) * (values[i] - yMean);
    denominator += (xs[i] - xMean) ** 2;
  }
  return denominator === 0 ? null : numerator / denominator;
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

function intervalsOverlap(a: { startMs: number; endMs: number }, b: { startMs: number; endMs: number }): boolean {
  return Math.max(a.startMs, b.startMs) < Math.min(a.endMs, b.endMs);
}

/**
 * Maximum plausible skew between the WebRTC media transport (SRTP, carries the actual audio) and
 * the Realtime data channel (SCTP, carries output_audio_buffer.started) reporting the SAME
 * real-world event — both are multiplexed over one ICE/DTLS connection, so genuine transport skew
 * for one event should be small (single/low-double-digit ms under normal conditions). Deliberately
 * far smaller than the 250ms-1.5s barge-in confirmation window itself, so a response that only
 * starts playing because real time passed (a true pre-playback case) cannot satisfy it — only two
 * transports narrowly disagreeing about when the same audio began can. See the module doc comment
 * on the media/data-channel ordering race, part two.
 */
const MEDIA_DATA_CHANNEL_SKEW_TOLERANCE_MS = 100;

/**
 * Below this duration, an "overlap" is indistinguishable from JS event-processing-order jitter
 * between two independently-timestamped WebRTC data-channel messages (dispatched a fraction of a
 * millisecond apart purely due to processing order, not anything acoustically real) rather than
 * genuine simultaneous speech — real human speech overlap operates on the order of tens to hundreds
 * of milliseconds at minimum, comfortably above this floor. See the module doc comment.
 */
const MIN_MEANINGFUL_OVERLAP_MS = 10;

/**
 * Resolves one raw confirmed-barge-in's final audible/pre_playback context and AI-response
 * attribution against the full, now-complete timeline. See the module doc comment on the
 * media/data-channel ordering race, part two, for the reconciliation rule.
 */
function resolveBargeInContext(
  raw: RawConfirmedBargeIn,
  aiTurnsByResponseId: ReadonlyMap<string, MutableAiTurn>,
): { interruptedResponseId: string | null; context: BargeInContext } {
  if (raw.audibleResponseIdAtStart !== null) {
    return { interruptedResponseId: raw.audibleResponseIdAtStart, context: "audible" };
  }
  if (raw.pendingResponseIdAtStart !== null) {
    const pendingTurn = aiTurnsByResponseId.get(raw.pendingResponseIdAtStart);
    if (pendingTurn && pendingTurn.startMs - raw.triggeringUserStartMs <= MEDIA_DATA_CHANNEL_SKEW_TOLERANCE_MS) {
      return { interruptedResponseId: raw.pendingResponseIdAtStart, context: "audible" };
    }
  }
  return { interruptedResponseId: raw.pendingResponseIdAtStart, context: "pre_playback" };
}

/**
 * Structural sanity checks over a finalized snapshot — never used to clamp/reject the data, only to
 * surface a lifecycle bug loudly (console.error in finalize()) so it's fixed at the source rather
 * than papered over. This product never plays more than one AI audio stream at a time and a user
 * cannot speak two turns at once, so every check below should always pass; a violation means an
 * event-lifecycle bug like the one described in the module doc comment ("Closing an AI turn
 * reliably"), not a legitimate edge case to accommodate.
 */
function validateSessionTimelineInvariants(params: {
  session: SessionLevelMetrics;
  aiTurns: AiTurnMetric[];
  confirmedUserTurns: UserTurnMetric[];
}): string[] {
  const { session, aiTurns, confirmedUserTurns } = params;
  const violations: string[] = [];

  if (session.totalAiSpeakingMs > session.totalDurationMs) {
    violations.push(
      `total_ai_speaking_ms (${session.totalAiSpeakingMs}) exceeds total_duration_ms (${session.totalDurationMs}) — this product never plays multiple AI audio streams at once.`,
    );
  }
  if (session.userSpeakingPercentage < 0 || session.userSpeakingPercentage > 100) {
    violations.push(`user_speaking_percentage (${session.userSpeakingPercentage}) is outside [0, 100].`);
  }
  if (session.aiSpeakingPercentage < 0 || session.aiSpeakingPercentage > 100) {
    violations.push(`ai_speaking_percentage (${session.aiSpeakingPercentage}) is outside [0, 100].`);
  }
  const maxAllowedOverlapMs = Math.min(session.totalUserSpeakingMs, session.totalAiSpeakingMs);
  if (session.totalOverlapMs > maxAllowedOverlapMs) {
    violations.push(
      `total_overlap_ms (${session.totalOverlapMs}) exceeds min(total_user_speaking_ms, total_ai_speaking_ms) = ${maxAllowedOverlapMs}.`,
    );
  }
  for (let i = 0; i < aiTurns.length; i++) {
    for (let j = i + 1; j < aiTurns.length; j++) {
      if (intervalsOverlap(aiTurns[i], aiTurns[j])) {
        violations.push(`AI turns ${aiTurns[i].responseId} and ${aiTurns[j].responseId} have overlapping intervals.`);
      }
    }
  }
  for (let i = 0; i < confirmedUserTurns.length; i++) {
    for (let j = i + 1; j < confirmedUserTurns.length; j++) {
      if (intervalsOverlap(confirmedUserTurns[i], confirmedUserTurns[j])) {
        violations.push(`User turns ${confirmedUserTurns[i].itemId} and ${confirmedUserTurns[j].itemId} have overlapping intervals.`);
      }
    }
  }

  return violations;
}

export function createSessionTimeline(options: SessionTimelineOptions = {}): SessionTimeline {
  const now = options.now ?? (() => performance.now());
  const sessionStartMs = now();
  const elapsed = () => now() - sessionStartMs;

  const userTurnsByItemId = new Map<string, MutableUserTurn>();
  const userTurnOrder: string[] = [];
  const aiTurnsByResponseId = new Map<string, MutableAiTurn>();
  const aiTurnOrder: string[] = [];
  /** Raw evidence only — context/attribution/dedup are resolved from scratch in finalize(). See
   *  RawConfirmedBargeIn and the module doc comment on the media/data-channel ordering race, part
   *  two. */
  const provisionalBargeIns: RawConfirmedBargeIn[] = [];
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

  /** Shared by recordAiAudioStopped/recordAiAudioCleared/recordResponseDone's safety net — closing
   *  an AI turn is idempotent regardless of which event does it first. */
  function closeAiTurn(responseId: string) {
    const turn = aiTurnsByResponseId.get(responseId);
    if (!turn || turn.endMs !== null) return;
    turn.endMs = elapsed();
    if (currentAiResponseId === responseId) currentAiResponseId = null;
  }

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
        // Snapshotted NOW, not re-derived later — see the module doc comment on classifying
        // audible-vs-pre_playback at speech-start time.
        audibleAiResponseIdAtStart: currentAiResponseId,
        pendingAiResponseIdAtStart: pendingResponseId,
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
      closeAiTurn(responseId);
    },

    recordAiAudioCleared(responseId) {
      closeAiTurn(responseId);
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
      // Safety net: a response that did not complete normally can never produce further audio, so
      // if .stopped/.cleared hasn't already closed this turn, close it now rather than leaving it
      // open until session finalize — see the module doc comment on closing an AI turn reliably.
      // A "completed" response is left to .stopped, which may still be draining a residual buffer.
      if (status !== "completed") closeAiTurn(responseId);
    },

    recordConfirmedBargeIn() {
      // A confirmed barge-in can only ever fire while the triggering user turn is still open (see
      // bargeIn.ts — a blip that stops before confirmation never reaches this callback), so
      // whichever user turn is currently open is unambiguously the one that earned it.
      const userTurn = currentOpenUserItemId ? userTurnsByItemId.get(currentOpenUserItemId) : null;

      // Record raw evidence only — context/attribution/dedup are resolved later, in finalize(),
      // once the full timeline is known. See the module doc comment on the media/data-channel
      // ordering race, part two. The `userTurn` guard is a defensive fallback only (the invariant
      // above should always hold); falling back to live state here is strictly no worse than
      // treating this as an ordinary (non-snapshotted) read.
      provisionalBargeIns.push({
        atMs: elapsed(),
        audibleResponseIdAtStart: userTurn ? userTurn.audibleAiResponseIdAtStart : currentAiResponseId,
        pendingResponseIdAtStart: userTurn ? userTurn.pendingAiResponseIdAtStart : pendingResponseId,
        triggeringUserStartMs: userTurn ? userTurn.startMs : elapsed(),
      });
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
        // Word count / speaking rate: evidence only, computed here (not gated on classification)
        // since a suspected_noise turn is filtered out of confirmedUserTurns below anyway, and
        // computing it unconditionally keeps this mapping a straightforward function of the turn's
        // own transcript+duration. See UserTurnMetric's doc comments for MIN_WORDS_FOR_RATE.
        const wordCount = t.transcript !== null ? countWords(t.transcript) : null;
        const speakingRateWpm =
          wordCount !== null && wordCount >= MIN_WORDS_FOR_RATE && durationMs > 0 ? wordCount / (durationMs / 60000) : null;
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
          audibleAiResponseIdAtStart: t.audibleAiResponseIdAtStart,
          wordCount,
          speakingRateWpm,
        };
      });
      // Everything below derives session-level facts from CONFIRMED user turns only — a
      // suspected_noise event must never contribute to turn counts, speaking time, response
      // latency (in either direction), or overlap. It is still returned in `userTurns` above,
      // unabridged, for diagnostic/audit purposes.
      const confirmedUserTurns = userTurns.filter((t) => t.classification === "confirmed");

      // Filler/disfluency candidates: derived purely from each CONFIRMED turn's own final
      // transcript (fillerCandidates.ts is pure string logic — see its doc comment for reliability
      // caveats by category). approxSessionMs interpolates proportionally across the turn's own
      // [startMs, endMs] span, since no word-level timing exists in the transcription pipeline.
      const fillerCandidates: FillerCandidateMetric[] = confirmedUserTurns.flatMap((t) => {
        if (!t.transcript || t.turnIndex === null) return [];
        const transcript = t.transcript;
        const turnIndex = t.turnIndex;
        const transcriptLength = transcript.length;
        return detectFillerCandidates(transcript).map((c) => ({
          ...c,
          itemId: t.itemId,
          turnIndex,
          approxSessionMs:
            transcriptLength > 0 ? t.startMs + (c.transcriptStartChar / transcriptLength) * t.durationMs : null,
        }));
      });

      // Resolve every confirmed barge-in's final context/attribution against the full timeline —
      // must run BEFORE aiTurns is built below, so a retroactive "audible" reclassification's
      // wasInterrupted marking is reflected in the immutable snapshot. Recomputed from scratch (a
      // fresh dedup set, not a persistent one) so a duplicate finalize() call stays idempotent. See
      // the module doc comment on the media/data-channel ordering race, part two.
      const audibleInterruptedResponseIds = new Set<string>();
      const confirmedBargeIns: ConfirmedBargeInMetric[] = provisionalBargeIns.map((raw) => {
        const { interruptedResponseId, context } = resolveBargeInContext(raw, aiTurnsByResponseId);
        const countsTowardInterruption =
          context === "audible" && interruptedResponseId !== null && !audibleInterruptedResponseIds.has(interruptedResponseId);
        if (context === "audible" && interruptedResponseId !== null) {
          audibleInterruptedResponseIds.add(interruptedResponseId);
        }
        if (context === "audible" && interruptedResponseId !== null) {
          const aiTurn = aiTurnsByResponseId.get(interruptedResponseId);
          if (aiTurn) aiTurn.wasInterrupted = true;
        }
        return { atMs: raw.atMs, aiResponseId: interruptedResponseId, context, countsTowardInterruption };
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
          // Below MIN_MEANINGFUL_OVERLAP_MS, an "overlap" is indistinguishable from event-processing
          // jitter between two independently-timestamped events, not real simultaneous speech.
          if (end - start >= MIN_MEANINGFUL_OVERLAP_MS) {
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

      // Speaking rate: only turns meeting MIN_WORDS_FOR_RATE contribute — see
      // UserTurnMetric.speakingRateWpm's doc comment. Fastest/slowest/trend are drawn from this same
      // filtered set, never from every confirmed turn, so a one-word "Okay." never appears as a
      // spurious "fastest turn".
      const qualifyingWpmTurns = confirmedUserTurns.filter((t) => t.speakingRateWpm !== null);
      const wpmValues = qualifyingWpmTurns.map((t) => t.speakingRateWpm as number);

      const totalWords = confirmedUserTurns.reduce((sum, t) => sum + (t.wordCount ?? 0), 0);
      const vocalDisfluencyCandidateCount = fillerCandidates.filter((c) => c.category === "vocal_disfluency_candidate").length;
      const lexicalDiscourseCandidateCount = fillerCandidates.filter((c) => c.category === "lexical_discourse_candidate").length;
      const repetitionCandidateCount = fillerCandidates.filter((c) => c.category === "repetition_candidate").length;
      const totalCandidates = fillerCandidates.length;

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
        confirmedInterruptionCount: confirmedBargeIns.filter((b) => b.countsTowardInterruption).length,
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
        avgWordsPerMinute: average(wpmValues),
        medianWordsPerMinute: median(wpmValues),
        fastestUserTurnWpm: wpmValues.length > 0 ? Math.max(...wpmValues) : null,
        slowestUserTurnWpm: wpmValues.length > 0 ? Math.min(...wpmValues) : null,
        wpmTrendSlopePerTurn: linearRegressionSlope(wpmValues),
        vocalDisfluencyCandidateCount,
        lexicalDiscourseCandidateCount,
        repetitionCandidateCount,
        candidateRatePer100Words: totalWords > 0 ? (totalCandidates / totalWords) * 100 : null,
        candidateRatePerMinuteSpeaking: totalUserSpeakingMs > 0 ? totalCandidates / (totalUserSpeakingMs / 60000) : null,
      };

      const invariantViolations = validateSessionTimelineInvariants({ session, aiTurns, confirmedUserTurns });
      if (invariantViolations.length > 0) {
        console.error("[voice:realtime:metrics] session timeline invariant violation(s) — see /docs/DECISIONS.md", invariantViolations);
      }

      return {
        totalDurationMs: finalizedAtMs,
        userTurns,
        aiTurns,
        overlaps,
        confirmedBargeIns: [...confirmedBargeIns],
        responseCancellations: [...responseCancellations],
        fillerCandidates,
        session,
        invariantViolations,
      };
    },
  };
}

/** Formats a snapshot into human-readable lines for development/QA use — see debugLog.ts. Seconds, matching the product spec's example. */
export function formatSessionTimelineDebugLines(snapshot: SessionTimelineSnapshot): string[] {
  const toS = (ms: number) => (ms / 1000).toFixed(2);
  const lines: string[] = [];

  for (const t of snapshot.userTurns) {
    if (t.classification === "confirmed") {
      const wpmSuffix =
        t.wordCount !== null
          ? ` / ${t.wordCount} word(s)${t.speakingRateWpm !== null ? ` / ${t.speakingRateWpm.toFixed(0)} WPM` : " (too short for a rate)"}`
          : "";
      lines.push(`User turn ${t.turnIndex}: start ${toS(t.startMs)}s / end ${toS(t.endMs)}s / duration ${toS(t.durationMs)}s${wpmSuffix}`);
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
  if (snapshot.session.avgWordsPerMinute !== null) {
    lines.push(
      `Speaking rate (evidence only, no ideal implied): avg ${snapshot.session.avgWordsPerMinute.toFixed(0)} WPM / median ${(snapshot.session.medianWordsPerMinute ?? 0).toFixed(0)} WPM / fastest ${(snapshot.session.fastestUserTurnWpm ?? 0).toFixed(0)} / slowest ${(snapshot.session.slowestUserTurnWpm ?? 0).toFixed(0)}`,
    );
  }
  if (snapshot.fillerCandidates.length > 0) {
    lines.push(
      `Filler/disfluency candidates (unclassified — see fillerCandidates.ts for reliability caveats): ${snapshot.session.vocalDisfluencyCandidateCount} vocal (undercount-only), ${snapshot.session.lexicalDiscourseCandidateCount} lexical/discourse, ${snapshot.session.repetitionCandidateCount} repetition`,
    );
    for (const c of snapshot.fillerCandidates) {
      lines.push(`  - "${c.phrase}" [${c.category}, ${c.classification}] in user turn ${c.turnIndex} (…${c.contextBefore}[${c.phrase}]${c.contextAfter}…)`);
    }
  }
  if (snapshot.invariantViolations.length > 0) {
    lines.push(`INVARIANT VIOLATIONS (${snapshot.invariantViolations.length}):`);
    for (const violation of snapshot.invariantViolations) lines.push(`  - ${violation}`);
  }

  return lines;
}
