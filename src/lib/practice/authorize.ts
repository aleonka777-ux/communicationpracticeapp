import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSession } from "@/lib/db/sessions";
import type { Database, PracticeSessionRow } from "@/lib/db/types";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Loads a practice session and verifies the current request's authenticated user owns it.
 * RLS already prevents the underlying query from returning another user's row, but we check
 * explicitly too — see CLAUDE.md "Security constraints" (defense in depth, not just RLS).
 */
export async function requireOwnedSession(
  supabase: SupabaseClient<Database>,
  sessionId: string,
): Promise<{ userId: string; session: PracticeSessionRow }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new ApiError(401, "You must be logged in.");

  const session = await getSession(supabase, sessionId);
  if (!session || session.user_id !== user.id) {
    throw new ApiError(404, "Practice session not found.");
  }

  return { userId: user.id, session };
}
