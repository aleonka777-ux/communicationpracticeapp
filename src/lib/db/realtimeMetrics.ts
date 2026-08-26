import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type {
  Database,
  RealtimeDisfluencyCandidateRow,
  RealtimePauseEventRow,
  RealtimeSessionMetricsRow,
  RealtimeTurnEventRow,
} from "@/lib/db/types";

export type RealtimeTurnEventInput = Omit<RealtimeTurnEventRow, "id" | "session_id" | "created_at">;
export type RealtimeSessionMetricsInput = Omit<RealtimeSessionMetricsRow, "id" | "session_id" | "computed_at">;
export type RealtimePauseEventInput = Omit<RealtimePauseEventRow, "id" | "session_id" | "created_at">;
export type RealtimeDisfluencyCandidateInput = Omit<RealtimeDisfluencyCandidateRow, "id" | "session_id" | "created_at">;

/**
 * Postgres reports a type-mismatch error (e.g. 22P02, "invalid input syntax for type integer")
 * with the offending VALUE but never the column name, so a bare error.message alone isn't enough
 * to find the culprit column in a many-column table. Logging the full row payload alongside it
 * (never transcript text — this table has none, see RealtimeTurnEventRow) lets a future
 * schema/type mismatch be diagnosed directly from logs instead of by guesswork.
 */
function logPersistenceFailure(context: string, sessionId: string, error: PostgrestError, rows?: unknown): void {
  console.error(
    `[realtime-metrics] ${context} failed (transcript/evaluation unaffected)`,
    JSON.stringify({ sessionId, code: error.code, message: error.message, details: error.details, hint: error.hint, rows }),
  );
}

/**
 * Replaces all turn events for a session in one delete-then-insert pass, so finalization stays
 * idempotent under a retry (the alternative — appending on every attempt — would double-count
 * turns). A no-op insert (empty array) is skipped entirely rather than sent as a 0-row insert.
 */
export async function saveRealtimeTurnEvents(
  supabase: SupabaseClient<Database>,
  sessionId: string,
  events: RealtimeTurnEventInput[],
): Promise<void> {
  const { error: deleteError } = await supabase.from("realtime_turn_events").delete().eq("session_id", sessionId);
  if (deleteError) {
    logPersistenceFailure("realtime_turn_events delete", sessionId, deleteError);
    throw deleteError;
  }

  if (events.length === 0) return;

  const rows = events.map((event) => ({ ...event, session_id: sessionId }));
  const { error: insertError } = await supabase.from("realtime_turn_events").insert(rows);
  if (insertError) {
    logPersistenceFailure("realtime_turn_events insert", sessionId, insertError, rows);
    throw insertError;
  }
}

/** Upserts the one session-level metrics row by session_id, so a retried finalization stays idempotent. */
export async function upsertRealtimeSessionMetrics(
  supabase: SupabaseClient<Database>,
  sessionId: string,
  metrics: RealtimeSessionMetricsInput,
): Promise<RealtimeSessionMetricsRow> {
  const { data, error } = await supabase
    .from("realtime_session_metrics")
    .upsert({ ...metrics, session_id: sessionId }, { onConflict: "session_id" })
    .select("*")
    .single();
  if (error) {
    logPersistenceFailure("realtime_session_metrics upsert", sessionId, error, metrics);
    throw error;
  }
  return data;
}

export async function getRealtimeSessionMetrics(
  supabase: SupabaseClient<Database>,
  sessionId: string,
): Promise<RealtimeSessionMetricsRow | null> {
  const { data, error } = await supabase
    .from("realtime_session_metrics")
    .select("*")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Same idempotent delete-then-insert pattern as saveRealtimeTurnEvents — see its doc comment. */
export async function saveRealtimePauseEvents(
  supabase: SupabaseClient<Database>,
  sessionId: string,
  events: RealtimePauseEventInput[],
): Promise<void> {
  const { error: deleteError } = await supabase.from("realtime_pause_events").delete().eq("session_id", sessionId);
  if (deleteError) {
    logPersistenceFailure("realtime_pause_events delete", sessionId, deleteError);
    throw deleteError;
  }

  if (events.length === 0) return;

  const rows = events.map((event) => ({ ...event, session_id: sessionId }));
  const { error: insertError } = await supabase.from("realtime_pause_events").insert(rows);
  if (insertError) {
    logPersistenceFailure("realtime_pause_events insert", sessionId, insertError, rows);
    throw insertError;
  }
}

/** Same idempotent delete-then-insert pattern as saveRealtimeTurnEvents — see its doc comment. */
export async function saveRealtimeDisfluencyCandidates(
  supabase: SupabaseClient<Database>,
  sessionId: string,
  candidates: RealtimeDisfluencyCandidateInput[],
): Promise<void> {
  const { error: deleteError } = await supabase.from("realtime_disfluency_candidates").delete().eq("session_id", sessionId);
  if (deleteError) {
    logPersistenceFailure("realtime_disfluency_candidates delete", sessionId, deleteError);
    throw deleteError;
  }

  if (candidates.length === 0) return;

  const rows = candidates.map((candidate) => ({ ...candidate, session_id: sessionId }));
  const { error: insertError } = await supabase.from("realtime_disfluency_candidates").insert(rows);
  if (insertError) {
    logPersistenceFailure("realtime_disfluency_candidates insert", sessionId, insertError, rows);
    throw insertError;
  }
}

export async function listRealtimeTurnEvents(
  supabase: SupabaseClient<Database>,
  sessionId: string,
): Promise<RealtimeTurnEventRow[]> {
  const { data, error } = await supabase
    .from("realtime_turn_events")
    .select("*")
    .eq("session_id", sessionId)
    .order("start_ms", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** Debug/QA use — see /docs/DECISIONS.md "Phase 4A: speech-delivery evidence" for the inspection
 *  procedure this supports. */
export async function listRealtimePauseEvents(
  supabase: SupabaseClient<Database>,
  sessionId: string,
): Promise<RealtimePauseEventRow[]> {
  const { data, error } = await supabase
    .from("realtime_pause_events")
    .select("*")
    .eq("session_id", sessionId)
    .order("start_ms", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** Debug/QA use — see /docs/DECISIONS.md "Phase 4A: speech-delivery evidence" for the inspection
 *  procedure this supports. */
export async function listRealtimeDisfluencyCandidates(
  supabase: SupabaseClient<Database>,
  sessionId: string,
): Promise<RealtimeDisfluencyCandidateRow[]> {
  const { data, error } = await supabase
    .from("realtime_disfluency_candidates")
    .select("*")
    .eq("session_id", sessionId)
    .order("approx_session_ms", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return data ?? [];
}
