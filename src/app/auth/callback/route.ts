import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { completeAuthCallback } from "@/lib/auth/callback";
import { sanitizeNextPath } from "@/lib/auth/redirect";

export const dynamic = "force-dynamic";

/**
 * The one route every Supabase auth email link (recovery, magic-link, signup confirmation)
 * should be pointed at — see src/lib/auth/callback.ts for why both link formats are handled and
 * CLAUDE.md Stage B.2 for the bug this fixes. `next` is attacker-controllable (it arrives on the
 * URL) so it is sanitized to a same-origin path before use — see src/lib/auth/redirect.ts.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;

  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const error = searchParams.get("error");
  const next = sanitizeNextPath(searchParams.get("next"), "/home");

  const supabase = await createClient();
  const result = await completeAuthCallback(supabase, { code, tokenHash, type, error });

  if (!result.success) {
    const url = new URL("/forgot-password", origin);
    url.searchParams.set("error", "link");
    return NextResponse.redirect(url);
  }

  // A completed recovery always goes to the password-update form, regardless of `next` — the
  // point of a recovery link is to change the password, not to silently sign the user into
  // wherever they happened to be headed.
  if (result.type === "recovery") {
    return NextResponse.redirect(new URL("/auth/update-password", origin));
  }

  return NextResponse.redirect(new URL(next, origin));
}
