/**
 * Hand-maintained TypeScript types mirroring the Postgres schema in supabase/migrations.
 * Keep in sync with the migrations by hand (no ORM/codegen — see /docs/DECISIONS.md).
 */

export type UserRole = "user" | "coach";
export type PracticeMode = "realistic" | "training";
export type DurationSeconds = 120 | 180 | 300;
export type SessionStatus = "in_progress" | "evaluating" | "completed" | "abandoned";
export type MessageSpeaker = "user" | "interlocutor" | "coach_hint";
export type EmotionalIntensity = "low" | "moderate" | "high";
export type Difficulty = "beginner" | "intermediate" | "advanced";

export interface EvaluationWeights {
  clarity: number;
  assertiveness: number;
  acknowledgment: number;
  non_escalation: number;
  technique: number;
  effectiveness: number;
}

export type EvaluationDimension = keyof EvaluationWeights;

export const EVALUATION_DIMENSIONS: EvaluationDimension[] = [
  "clarity",
  "assertiveness",
  "acknowledgment",
  "non_escalation",
  "technique",
  "effectiveness",
];

export interface MethodStep {
  step: string;
  description: string;
}

export interface ProfileRow {
  id: string;
  display_name: string;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export interface CommunicationToolRow {
  id: string;
  slug: string;
  name: string;
  short_description: string;
  purpose: string;
  when_to_use: string;
  core_principles: string[];
  step_by_step_method: MethodStep[];
  good_examples: string[];
  weak_examples: string[];
  common_mistakes: string[];
  evaluation_criteria: Partial<Record<EvaluationDimension, string>>;
  coaching_guidance: string;
  evaluation_weights: EvaluationWeights;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ScenarioEvaluationOverrides {
  weights?: Partial<EvaluationWeights>;
}

export interface ScenarioRow {
  id: string;
  tool_id: string;
  title: string;
  context: string;
  user_role: string;
  user_objective: string;
  ai_role: string;
  relationship: string;
  ai_personality: string;
  ai_objective: string;
  emotional_intensity: EmotionalIntensity;
  difficulty: Difficulty;
  opening_line: string;
  character_behaviours: string[];
  escalation_rules: string[];
  deescalation_rules: string[];
  scenario_constraints: string[];
  evaluation_overrides: ScenarioEvaluationOverrides;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PracticeSessionRow {
  id: string;
  user_id: string;
  scenario_id: string;
  tool_id: string;
  mode: PracticeMode;
  selected_duration_seconds: DurationSeconds;
  started_at: string;
  ended_at: string | null;
  status: SessionStatus;
  attempt_number: number;
  hint_count: number;
  readiness_rating: number | null;
  created_at: string;
  updated_at: string;
}

export interface ConversationMessageRow {
  id: string;
  session_id: string;
  sequence: number;
  speaker: MessageSpeaker;
  text: string;
  created_at: string;
}

export interface EvaluationStrength {
  point: string;
  evidence: string;
}

export interface EvaluationImprovement {
  issue: string;
  why_it_matters: string;
  suggestion: string;
  example?: string;
}

export interface DimensionEvidence {
  evidence: string;
  explanation: string;
}

export type StructuredEvidence = Partial<Record<EvaluationDimension, DimensionEvidence>>;

export interface ComparisonData {
  previous_session_id: string;
  score_deltas: Partial<Record<EvaluationDimension, number>>;
  qualitative_notes: string[];
}

export interface EvaluationRow {
  id: string;
  session_id: string;
  clarity_score: number;
  assertiveness_score: number;
  acknowledgment_score: number;
  non_escalation_score: number;
  technique_score: number;
  effectiveness_score: number;
  overall_summary: string;
  strengths: EvaluationStrength[];
  improvements: EvaluationImprovement[];
  next_focus: string;
  structured_evidence: StructuredEvidence;
  comparison_data: ComparisonData | null;
  evaluator_metadata: Record<string, unknown>;
  created_at: string;
}

export type RealtimeTurnEventKind = "user_turn" | "ai_turn" | "overlap" | "confirmed_barge_in";
export type RealtimeTurnDurationSource = "server_vad" | "client_playback";
export type RealtimeResponseStatus = "completed" | "cancelled" | "failed" | "incomplete" | "in_progress";
/**
 * user_turn rows only — whether this raw speech_started/speech_stopped pair is treated as a real
 * user communication turn ("confirmed") or excluded from all derived session metrics as a likely
 * false VAD/echo event ("suspected_noise"). See src/lib/realtime/sessionTimeline.ts's classification
 * doc comment for the exact rule. Null for every other event kind.
 */
export type RealtimeUserTurnClassification = "confirmed" | "suspected_noise";
/**
 * confirmed_barge_in rows only. "audible": AI audio was actually playing when the barge-in
 * confirmed — the coaching-relevant case. "pre_playback": the response had been created but had
 * not yet produced any audio — a real technical barge-in/cancellation, but not an audible
 * interruption. See src/lib/realtime/sessionTimeline.ts's doc comment. Null for every other kind.
 */
export type RealtimeBargeInContext = "audible" | "pre_playback";

/**
 * One row per user turn, AI turn, overlap interval, or confirmed barge-in — see
 * supabase/migrations/0009_realtime_timing_metrics.sql and /docs/DECISIONS.md "Realtime timing
 * metrics". Never contains raw audio; only timestamps (ms relative to session start), durations,
 * and small structured metadata.
 */
export interface RealtimeTurnEventRow {
  id: string;
  session_id: string;
  kind: RealtimeTurnEventKind;
  /** Always a whole number (array position) — the one genuinely integer field among these. */
  turn_index: number | null;
  /**
   * double precision in Postgres (see migration 0010) — derived from the client's monotonic clock
   * (performance.now()), which is inherently fractional. Do not assume/round to a whole number.
   */
  start_ms: number;
  end_ms: number | null;
  duration_ms: number | null;
  duration_source: RealtimeTurnDurationSource | null;
  /** double precision — see migration 0010; not guaranteed to be a whole millisecond by the SDK. */
  server_audio_start_ms: number | null;
  server_audio_end_ms: number | null;
  was_interrupted: boolean | null;
  ended_by_session_close: boolean | null;
  response_status: RealtimeResponseStatus | null;
  realtime_item_id: string | null;
  realtime_response_id: string | null;
  message_id: string | null;
  user_turn_classification: RealtimeUserTurnClassification | null;
  transcription_failed: boolean | null;
  /** user_turn rows only. The turn's final transcript text, verbatim — see
   *  src/lib/realtime/sessionTimeline.ts's UserTurnMetric.transcript. Null for every other kind, or
   *  when no transcript exists. Added for Phase 4B.1A's combined-transcript evidence — see
   *  supabase/migrations/0016_semantic_responses.sql. */
  transcript: string | null;
  barge_in_context: RealtimeBargeInContext | null;
  /** confirmed_barge_in rows only. False for a repeat confirmation against an AI response already
   *  counted as interrupted, or for a pre_playback context. See
   *  src/lib/realtime/sessionTimeline.ts's doc comment on idempotent audible interruption. Null for
   *  every other kind. */
  counts_toward_interruption: boolean | null;
  /** user_turn rows only. The OpenAI Realtime response id that was actively playing audio at the
   *  instant this speech interval began — snapshotted then, never re-derived later. External API
   *  id, not a foreign key, matching realtime_response_id's own convention. Null if the AI was not
   *  audibly playing when this turn started, or for every non-user_turn kind. See
   *  src/lib/realtime/sessionTimeline.ts's doc comment on classifying audible-vs-pre_playback at
   *  speech-start time. */
  audible_ai_response_id_at_start: string | null;
  /** user_turn rows only. Phase 4A speech-delivery evidence — see
   *  src/lib/realtime/sessionTimeline.ts's UserTurnMetric doc comments. Null for every other kind,
   *  or when there was no transcript / turn was too short to compute a rate. */
  word_count: number | null;
  speaking_rate_wpm: number | null;
  /** user_turn rows only. Relative/unitless RMS-derived intensity evidence — NEVER dB SPL. See
   *  src/lib/realtime/speechDeliveryTracker.ts. Null for every other kind, or when the mic-energy
   *  monitor produced no samples for this turn. */
  avg_relative_intensity: number | null;
  peak_relative_intensity: number | null;
  intensity_variability: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

/** Phase 4A: one row per detected intra-utterance pause (a period of low mic energy inside an
 *  already-open, CONFIRMED user turn) — see src/lib/realtime/speechDeliveryTracker.ts for detection
 *  method/threshold rationale, and supabase/migrations/0014_speech_delivery_evidence.sql. Never
 *  contains raw audio — only timestamps/durations/position evidence. */
export interface RealtimePauseEventRow {
  id: string;
  session_id: string;
  /** External Realtime item_id of the owning user turn — not a foreign key, matching
   *  realtime_turn_events.realtime_item_id's own convention. */
  realtime_item_id: string;
  start_ms: number;
  duration_ms: number;
  position_ratio: number;
  position_bucket: "beginning" | "middle" | "end";
  created_at: string;
}

export type RealtimeFillerCandidateCategory = "vocal_disfluency_candidate" | "lexical_discourse_candidate" | "repetition_candidate";

/**
 * Phase 4A: one row per filler/disfluency CANDIDATE occurrence — see
 * src/lib/realtime/fillerCandidates.ts for what "candidate" deliberately does not mean (a proven
 * filler) and why reliability differs by category. `classification` is always 'unclassified' today;
 * the column exists so a future Phase 4B can update rows in place rather than needing a new table.
 */
export interface RealtimeDisfluencyCandidateRow {
  id: string;
  session_id: string;
  realtime_item_id: string;
  turn_index: number;
  category: RealtimeFillerCandidateCategory;
  classification: string;
  phrase: string;
  transcript_start_char: number;
  transcript_end_char: number;
  context_before: string;
  context_after: string;
  /** Estimated by proportional interpolation across the turn's span — NOT a measured timestamp. See
   *  sessionTimeline.ts's FillerCandidateMetric doc comment. */
  approx_session_ms: number | null;
  created_at: string;
}

/**
 * Session-level derived timing/interruption metrics — one row per session, upserted at
 * finalization. Every *_ms field is double precision in Postgres (see migration 0010) — all are
 * derived from the client's monotonic clock or arithmetic (sums/averages/medians) over it, and are
 * inherently fractional. Only the *_count fields (and user/ai_turn_count) are genuine integers.
 */
export interface RealtimeSessionMetricsRow {
  id: string;
  session_id: string;
  total_duration_ms: number;
  user_turn_count: number;
  ai_turn_count: number;
  total_user_speaking_ms: number;
  total_ai_speaking_ms: number;
  user_speaking_percentage: number;
  ai_speaking_percentage: number;
  total_overlap_ms: number;
  overlap_count: number;
  /** Coaching-facing: audible interruptions only (context "audible"). See RealtimeBargeInContext. */
  confirmed_interruption_count: number;
  /** Diagnostic total: every confirmed barge-in regardless of context (audible + pre_playback). */
  technical_barge_in_count: number;
  suspected_noise_event_count: number;
  avg_user_turn_duration_ms: number | null;
  longest_user_turn_ms: number | null;
  avg_ai_turn_duration_ms: number | null;
  avg_user_response_latency_ms: number | null;
  median_user_response_latency_ms: number | null;
  longest_user_response_latency_ms: number | null;
  avg_ai_response_latency_ms: number | null;
  median_ai_response_latency_ms: number | null;
  /** System/product-quality diagnostic ONLY — see sessionTimeline.ts's UnansweredUserTurnMetric doc
   *  comment. Never a coaching signal: a confirmed user turn with no AI turn immediately following
   *  it, beyond MIN_UNANSWERED_GAP_MS, before either the next user turn or session end. */
  unanswered_user_turn_count: number;
  longest_unanswered_stall_ms: number | null;
  // Phase 4A speech-delivery evidence — see sessionTimeline.ts's SessionLevelMetrics doc comments.
  avg_words_per_minute: number | null;
  median_words_per_minute: number | null;
  fastest_user_turn_wpm: number | null;
  slowest_user_turn_wpm: number | null;
  wpm_trend_slope_per_turn: number | null;
  vocal_disfluency_candidate_count: number;
  lexical_discourse_candidate_count: number;
  repetition_candidate_count: number;
  candidate_rate_per_100_words: number | null;
  candidate_rate_per_minute_speaking: number | null;
  intra_pause_count: number;
  total_intra_pause_ms: number;
  avg_intra_pause_ms: number | null;
  median_intra_pause_ms: number | null;
  longest_intra_pause_ms: number | null;
  pauses_per_minute_speaking: number | null;
  computed_at: string;
}

/**
 * Phase 4B.1A: one row per Semantic Response — one or more adjacent CONFIRMED raw user turns
 * (realtime_turn_events) grouped by deterministic interaction/timing evidence only. See
 * supabase/migrations/0016_semantic_responses.sql and src/lib/semanticResponse/*.
 */
export interface SemanticResponseRow {
  id: string;
  session_id: string;
  response_index: number;
  grouping_algorithm_version: string;
  start_ms: number;
  end_ms: number;
  span_duration_ms: number;
  /** 'high' for any multi-turn merge (Phase 4B.1A only ever auto-merges at high confidence); null
   *  for a singleton response (no merge decision was made). Not enum-constrained at the DB level —
   *  a future Phase 4B.1B may introduce additional tiers. */
  grouping_confidence: string | null;
  grouping_reasons: string[];
  preceding_boundary_decision: "merge" | "separate" | "ambiguous" | null;
  preceding_boundary_gap_ms: number | null;
  preceding_ai_response_id: string | null;
  response_latency_ms: number | null;
  transcript_coverage: "complete" | "partial" | "missing";
  combined_transcript: string | null;
  word_count: number | null;
  semantic_response_wpm: number | null;
  avg_relative_intensity: number | null;
  peak_relative_intensity: number | null;
  intensity_variability: number | null;
  started_while_ai_speaking: boolean | null;
  user_interrupted_ai: boolean | null;
  was_interrupted_by_ai: boolean | null;
  computed_at: string;
}

/**
 * Phase 4B.1A: one row per constituent raw user turn within a SemanticResponseRow, in chronological
 * order, carrying the bridge-gap evidence to the previous turn in the same response.
 */
export interface SemanticResponseTurnRow {
  id: string;
  session_id: string;
  semantic_response_id: string;
  realtime_item_id: string;
  turn_order_in_response: number;
  gap_before_ms: number | null;
  gap_counts_as_meaningful_pause: boolean | null;
}

export type ManualLifecycleStatus = "draft" | "parsed" | "validated" | "active" | "archived";

/**
 * Stage B: one row per uploaded Communication Manual source version — see
 * supabase/migrations/0017_manual_infrastructure.sql. `status` is the DB lifecycle state; it is a
 * distinct concept from `document_metadata.status`, which is the Manual's own textual "Status:"
 * header line (e.g. "Implementation-ready methodology contract for V1") — never confuse the two.
 */
export interface ManualVersionRow {
  id: string;
  version_label: string;
  status: ManualLifecycleStatus;
  source_filename: string;
  source_markdown: string;
  source_sha256: string;
  parser_version: string | null;
  block_count: number;
  parse_report: Record<string, unknown> | null;
  document_metadata: Record<string, unknown> | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  parsed_at: string | null;
  validated_at: string | null;
  activated_at: string | null;
  archived_at: string | null;
}

/**
 * Stage B: one atomic retrievable block parsed from a manual_versions row's source. Not read by the
 * Evaluation Engine in this stage — see CLAUDE.md Stage B scope boundary.
 */
export interface ManualBlockRow {
  id: string;
  manual_version_id: string;
  block_id: string;
  block_type: string | null;
  title: string | null;
  priority: string | null;
  status: string | null;
  ordinal: number;
  section_path: string[];
  metadata: Record<string, unknown>;
  body_markdown: string;
  content_hash: string;
  related_block_ids: string[];
  created_at: string;
}

/** Matches the classic @supabase/postgrest-js generated-types shape (Row/Insert/Update per table). */
type Table<Row, Insert> = { Row: Row; Insert: Insert; Update: Partial<Row> };

export interface Database {
  public: {
    Tables: {
      profiles: Table<ProfileRow, Partial<ProfileRow> & { id: string }>;
      communication_tools: Table<CommunicationToolRow, Partial<CommunicationToolRow>>;
      scenarios: Table<ScenarioRow, Partial<ScenarioRow>>;
      practice_sessions: Table<PracticeSessionRow, Partial<PracticeSessionRow>>;
      conversation_messages: Table<ConversationMessageRow, Partial<ConversationMessageRow>>;
      evaluations: Table<EvaluationRow, Omit<EvaluationRow, "id" | "created_at">>;
      realtime_turn_events: Table<RealtimeTurnEventRow, Omit<RealtimeTurnEventRow, "id" | "created_at">>;
      realtime_session_metrics: Table<RealtimeSessionMetricsRow, Omit<RealtimeSessionMetricsRow, "id" | "computed_at">>;
      realtime_pause_events: Table<RealtimePauseEventRow, Omit<RealtimePauseEventRow, "id" | "created_at">>;
      realtime_disfluency_candidates: Table<RealtimeDisfluencyCandidateRow, Omit<RealtimeDisfluencyCandidateRow, "id" | "created_at">>;
      semantic_responses: Table<SemanticResponseRow, Omit<SemanticResponseRow, "id" | "computed_at">>;
      semantic_response_turns: Table<SemanticResponseTurnRow, Omit<SemanticResponseTurnRow, "id">>;
      manual_versions: Table<ManualVersionRow, Omit<ManualVersionRow, "id" | "created_at" | "updated_at">>;
      manual_blocks: Table<ManualBlockRow, Omit<ManualBlockRow, "id" | "created_at">>;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
