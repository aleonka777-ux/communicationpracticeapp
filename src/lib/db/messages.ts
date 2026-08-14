import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConversationMessageRow, Database, MessageSpeaker } from "@/lib/db/types";

export async function listMessages(
  supabase: SupabaseClient<Database>,
  sessionId: string,
): Promise<ConversationMessageRow[]> {
  const { data, error } = await supabase
    .from("conversation_messages")
    .select("*")
    .eq("session_id", sessionId)
    .order("sequence", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/**
 * Appends a message at the next sequence number. Read-then-write; safe under the app's
 * request-per-turn flow (one write in flight per session — see /docs/DECISIONS.md).
 */
export async function appendMessage(
  supabase: SupabaseClient<Database>,
  sessionId: string,
  speaker: MessageSpeaker,
  text: string,
): Promise<ConversationMessageRow> {
  const { data: last, error: lastError } = await supabase
    .from("conversation_messages")
    .select("sequence")
    .eq("session_id", sessionId)
    .order("sequence", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastError) throw lastError;

  const nextSequence = (last?.sequence ?? 0) + 1;

  const { data, error } = await supabase
    .from("conversation_messages")
    .insert({ session_id: sessionId, sequence: nextSequence, speaker, text })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}
