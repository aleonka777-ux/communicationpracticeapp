import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, DurationSeconds, PracticeMode, PracticeSessionRow, ScenarioRow, CommunicationToolRow } from "@/lib/db/types";
import { computeNextAttemptNumber } from "@/lib/practice/attempts";

export interface CreateSessionInput {
  userId: string;
  scenarioId: string;
  toolId: string;
  mode: PracticeMode;
  durationSeconds: DurationSeconds;
}

export async function createSession(
  supabase: SupabaseClient<Database>,
  input: CreateSessionInput,
): Promise<PracticeSessionRow> {
  const { data: existing, error: existingError } = await supabase
    .from("practice_sessions")
    .select("attempt_number")
    .eq("user_id", input.userId)
    .eq("scenario_id", input.scenarioId);
  if (existingError) throw existingError;

  const attemptNumber = computeNextAttemptNumber((existing ?? []).map((row) => row.attempt_number));

  const { data, error } = await supabase
    .from("practice_sessions")
    .insert({
      user_id: input.userId,
      scenario_id: input.scenarioId,
      tool_id: input.toolId,
      mode: input.mode,
      selected_duration_seconds: input.durationSeconds,
      status: "in_progress",
      attempt_number: attemptNumber,
      started_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function getSession(
  supabase: SupabaseClient<Database>,
  sessionId: string,
): Promise<PracticeSessionRow | null> {
  const { data, error } = await supabase.from("practice_sessions").select("*").eq("id", sessionId).maybeSingle();
  if (error) throw error;
  return data;
}

export interface SessionWithContext extends PracticeSessionRow {
  scenario: ScenarioRow;
  tool: CommunicationToolRow;
}

export async function getSessionWithContext(
  supabase: SupabaseClient<Database>,
  sessionId: string,
): Promise<SessionWithContext | null> {
  const { data, error } = await supabase
    .from("practice_sessions")
    .select("*, scenario:scenarios(*), tool:communication_tools(*)")
    .eq("id", sessionId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return data as unknown as SessionWithContext;
}

export interface SessionListItem extends PracticeSessionRow {
  scenario: Pick<ScenarioRow, "id" | "title">;
  tool: Pick<CommunicationToolRow, "id" | "name" | "slug">;
}

export async function listSessionsForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
  limit = 50,
): Promise<SessionListItem[]> {
  const { data, error } = await supabase
    .from("practice_sessions")
    .select("*, scenario:scenarios(id, title), tool:communication_tools(id, name, slug)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as SessionListItem[];
}

export async function getAttemptsForScenario(
  supabase: SupabaseClient<Database>,
  userId: string,
  scenarioId: string,
): Promise<Pick<PracticeSessionRow, "id" | "attempt_number" | "status" | "created_at">[]> {
  const { data, error } = await supabase
    .from("practice_sessions")
    .select("id, attempt_number, status, created_at")
    .eq("user_id", userId)
    .eq("scenario_id", scenarioId)
    .order("attempt_number", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function finishConversation(supabase: SupabaseClient<Database>, sessionId: string): Promise<void> {
  const { error } = await supabase
    .from("practice_sessions")
    .update({ ended_at: new Date().toISOString(), status: "evaluating" })
    .eq("id", sessionId);
  if (error) throw error;
}

export async function markCompleted(supabase: SupabaseClient<Database>, sessionId: string): Promise<void> {
  const { error } = await supabase.from("practice_sessions").update({ status: "completed" }).eq("id", sessionId);
  if (error) throw error;
}

export async function markAbandoned(supabase: SupabaseClient<Database>, sessionId: string): Promise<void> {
  const { error } = await supabase
    .from("practice_sessions")
    .update({ status: "abandoned", ended_at: new Date().toISOString() })
    .eq("id", sessionId);
  if (error) throw error;
}

export async function setReadinessRating(
  supabase: SupabaseClient<Database>,
  sessionId: string,
  rating: number,
): Promise<void> {
  const { error } = await supabase.from("practice_sessions").update({ readiness_rating: rating }).eq("id", sessionId);
  if (error) throw error;
}

/**
 * Read-then-write increment. Acceptable because the UI only allows one pending hint request at a
 * time per session (button disabled while a request is in flight) — see /docs/DECISIONS.md if
 * this assumption ever changes.
 */
export async function incrementHintCount(supabase: SupabaseClient<Database>, sessionId: string): Promise<number> {
  const { data: current, error: readError } = await supabase
    .from("practice_sessions")
    .select("hint_count")
    .eq("id", sessionId)
    .single();
  if (readError) throw readError;

  const next = current.hint_count + 1;
  const { error: writeError } = await supabase
    .from("practice_sessions")
    .update({ hint_count: next })
    .eq("id", sessionId);
  if (writeError) throw writeError;
  return next;
}

export async function deleteSession(supabase: SupabaseClient<Database>, sessionId: string): Promise<void> {
  const { error } = await supabase.from("practice_sessions").delete().eq("id", sessionId);
  if (error) throw error;
}
