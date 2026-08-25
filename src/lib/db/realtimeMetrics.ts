import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, RealtimeSessionMetricsRow, RealtimeTurnEventRow } from "@/lib/db/types";

export type RealtimeTurnEventInput = Omit<RealtimeTurnEventRow, "id" | "session_id" | "created_at">;
export type RealtimeSessionMetricsInput = Omit<RealtimeSessionMetricsRow, "id" | "session_id" | "computed_at">;

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
  if (deleteError) throw deleteError;

  if (events.length === 0) return;

  const { error: insertError } = await supabase
    .from("realtime_turn_events")
    .insert(events.map((event) => ({ ...event, session_id: sessionId })));
  if (insertError) throw insertError;
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
  if (error) throw error;
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
