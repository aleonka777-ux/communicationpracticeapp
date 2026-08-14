import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, ScenarioRow } from "@/lib/db/types";

export async function listScenariosForTool(
  supabase: SupabaseClient<Database>,
  toolId: string,
): Promise<ScenarioRow[]> {
  const { data, error } = await supabase
    .from("scenarios")
    .select("*")
    .eq("tool_id", toolId)
    .order("difficulty", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function listAllScenarios(supabase: SupabaseClient<Database>): Promise<ScenarioRow[]> {
  const { data, error } = await supabase.from("scenarios").select("*").order("title", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getScenarioById(
  supabase: SupabaseClient<Database>,
  id: string,
): Promise<ScenarioRow | null> {
  const { data, error } = await supabase.from("scenarios").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function createScenario(
  supabase: SupabaseClient<Database>,
  input: Partial<ScenarioRow>,
): Promise<ScenarioRow> {
  const { data, error } = await supabase.from("scenarios").insert(input).select("*").single();
  if (error) throw error;
  return data;
}

export async function updateScenario(
  supabase: SupabaseClient<Database>,
  id: string,
  input: Partial<ScenarioRow>,
): Promise<ScenarioRow> {
  const { data, error } = await supabase.from("scenarios").update(input).eq("id", id).select("*").single();
  if (error) throw error;
  return data;
}
