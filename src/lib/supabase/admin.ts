import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { clientEnv } from "@/lib/env";
import { serverEnv } from "@/lib/env";
import type { Database } from "@/lib/db/types";

/**
 * Service-role Supabase client. Bypasses RLS entirely — use only for the narrow set of
 * operations that legitimately need it (see /docs/ARCHITECTURE.md §4). Never import this from
 * a "use client" file; the `server-only` import makes that a build error, not just a convention.
 */
export function createAdminClient() {
  const key = serverEnv.supabaseServiceRoleKey;
  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured.");
  }
  return createSupabaseClient<Database>(clientEnv.NEXT_PUBLIC_SUPABASE_URL, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
