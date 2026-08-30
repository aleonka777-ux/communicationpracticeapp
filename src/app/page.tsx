import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { completeAuthCallback } from "@/lib/auth/callback";

/**
 * A Supabase Dashboard-triggered "Send magic link"/"Send recovery email" uses the project's
 * configured Site URL with no custom `redirectTo` — i.e. the bare origin, which lands here, not
 * on /auth/callback (see CLAUDE.md Stage B.2 root-cause notes). Without this, those params were
 * silently discarded and the visitor fell straight through to the ordinary signed-out redirect,
 * which is the exact bug this stage fixes — without adding any new sign-in feature to the app.
 */
export default async function RootPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; token_hash?: string; type?: string; error?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  if (params.code || params.token_hash) {
    const result = await completeAuthCallback(supabase, {
      code: params.code ?? null,
      tokenHash: params.token_hash ?? null,
      type: params.type ?? null,
      error: params.error ?? null,
    });
    if (result.success && result.type === "recovery") {
      redirect("/auth/update-password");
    }
    // Any other outcome (success or failure) falls through to the ordinary session check below —
    // a successful non-recovery exchange means `user` will now be set.
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  redirect(user ? "/home" : "/login");
}
