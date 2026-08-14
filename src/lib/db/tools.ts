import type { SupabaseClient } from "@supabase/supabase-js";
import type { CommunicationToolRow, Database } from "@/lib/db/types";

/** RLS already limits results to active tools for non-coaches; coaches see everything. */
export async function listTools(supabase: SupabaseClient<Database>): Promise<CommunicationToolRow[]> {
  const { data, error } = await supabase
    .from("communication_tools")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getToolBySlug(
  supabase: SupabaseClient<Database>,
  slug: string,
): Promise<CommunicationToolRow | null> {
  const { data, error } = await supabase.from("communication_tools").select("*").eq("slug", slug).maybeSingle();
  if (error) throw error;
  return data;
}

export async function getToolById(
  supabase: SupabaseClient<Database>,
  id: string,
): Promise<CommunicationToolRow | null> {
  const { data, error } = await supabase.from("communication_tools").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function createTool(
  supabase: SupabaseClient<Database>,
  input: Partial<CommunicationToolRow>,
): Promise<CommunicationToolRow> {
  const { data, error } = await supabase.from("communication_tools").insert(input).select("*").single();
  if (error) throw error;
  return data;
}

export async function updateTool(
  supabase: SupabaseClient<Database>,
  id: string,
  input: Partial<CommunicationToolRow>,
): Promise<CommunicationToolRow> {
  const { data, error } = await supabase
    .from("communication_tools")
    .update(input)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}
