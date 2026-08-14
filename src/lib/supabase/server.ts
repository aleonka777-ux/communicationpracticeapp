import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { clientEnv } from "@/lib/env";
import type { Database } from "@/lib/db/types";

/**
 * Request-scoped Supabase client for Server Components, Route Handlers, and Server Actions.
 * Bound to the signed-in user's session cookie, so RLS applies exactly as it would client-side.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(clientEnv.NEXT_PUBLIC_SUPABASE_URL, clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component render (not an action/route handler); the middleware
          // is responsible for refreshing the session cookie in that case, so this is safe to ignore.
        }
      },
    },
  });
}
