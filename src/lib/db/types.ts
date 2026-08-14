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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
