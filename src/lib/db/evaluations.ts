import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, EvaluationRow } from "@/lib/db/types";

export async function getEvaluationForSession(
  supabase: SupabaseClient<Database>,
  sessionId: string,
): Promise<EvaluationRow | null> {
  const { data, error } = await supabase
    .from("evaluations")
    .select("*")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function saveEvaluation(
  supabase: SupabaseClient<Database>,
  input: Omit<EvaluationRow, "id" | "created_at">,
): Promise<EvaluationRow> {
  const { data, error } = await supabase.from("evaluations").insert(input).select("*").single();
  if (error) throw error;
  return data;
}
