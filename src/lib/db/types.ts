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
 * One row per user turn, AI turn, overlap interval, or confirmed barge-in — see
 * supabase/migrations/0009_realtime_timing_metrics.sql and /docs/DECISIONS.md "Realtime timing
 * metrics". Never contains raw audio; only timestamps (ms relative to session start), durations,
 * and small structured metadata.
 */
export interface RealtimeTurnEventRow {
  id: string;
  session_id: string;
  kind: RealtimeTurnEventKind;
  turn_index: number | null;
  start_ms: number;
  end_ms: number | null;
  duration_ms: number | null;
  duration_source: RealtimeTurnDurationSource | null;
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
  metadata: Record<string, unknown>;
  created_at: string;
}

/** Session-level derived timing/interruption metrics — one row per session, upserted at finalization. */
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
  confirmed_interruption_count: number;
  suspected_noise_event_count: number;
  avg_user_turn_duration_ms: number | null;
  longest_user_turn_ms: number | null;
  avg_ai_turn_duration_ms: number | null;
  avg_user_response_latency_ms: number | null;
  median_user_response_latency_ms: number | null;
  longest_user_response_latency_ms: number | null;
  avg_ai_response_latency_ms: number | null;
  median_ai_response_latency_ms: number | null;
  computed_at: string;
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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
