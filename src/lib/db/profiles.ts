import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, ProfileRow } from "@/lib/db/types";

export async function getCurrentProfile(supabase: SupabaseClient<Database>): Promise<ProfileRow | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (error) throw error;
  return data;
}

export function isCoach(profile: ProfileRow | null): boolean {
  return profile?.role === "coach";
}

export async function updateDisplayName(
  supabase: SupabaseClient<Database>,
  userId: string,
  displayName: string,
): Promise<void> {
  const { error } = await supabase.from("profiles").update({ display_name: displayName }).eq("id", userId);
  if (error) throw error;
}
