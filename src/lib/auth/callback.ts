import type { EmailOtpType, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";

/**
 * Shared session-establishment logic for wherever a Supabase auth email link might land — the
 * dedicated /auth/callback route handler AND the root page (Supabase Dashboard-triggered "Send
 * magic link"/"Send recovery email" use the project's configured Site URL with no custom
 * `redirectTo`, which is the bare origin, i.e. root — see CLAUDE.md Stage B.2 root-cause notes).
 *
 * This repo previously had no route capable of consuming either link format Supabase can produce
 * (PKCE `code`, or `token_hash` + `type`), so any such link's query params were silently ignored
 * and the browser fell through to the ordinary "not signed in -> /login" logic — the exact bug
 * this stage fixes. Both formats are handled here rather than assuming one, since the project's
 * actual Supabase email-template configuration cannot be inspected from this repository.
 */

const EMAIL_OTP_TYPES: readonly EmailOtpType[] = ["signup", "invite", "magiclink", "recovery", "email_change", "email"];

function isEmailOtpType(value: string): value is EmailOtpType {
  return (EMAIL_OTP_TYPES as readonly string[]).includes(value);
}

export interface AuthCallbackParams {
  code?: string | null;
  tokenHash?: string | null;
  type?: string | null;
  /** Present when Supabase itself rejected the link (expired/used/malformed) before it even
   *  reached the app — e.g. `error=access_denied&error_code=otp_expired`. */
  error?: string | null;
}

export interface AuthCallbackResult {
  success: boolean;
  /** The OTP type when known ("recovery" in particular — callers use this to route a completed
   *  recovery straight to the password-update form rather than a generic post-login page). Null
   *  when only a bare PKCE `code` arrived with no accompanying type. */
  type: EmailOtpType | null;
  /** Set only when success is false — safe to show the user as-is; never includes the raw
   *  Supabase error/token. */
  errorMessage?: string;
}

export const AUTH_LINK_ERROR_MESSAGE = "This link is invalid or has expired. Request a new one.";

export async function completeAuthCallback(
  supabase: SupabaseClient<Database>,
  params: AuthCallbackParams,
): Promise<AuthCallbackResult> {
  if (params.error) {
    return { success: false, type: null, errorMessage: AUTH_LINK_ERROR_MESSAGE };
  }

  if (params.tokenHash) {
    const otpType = params.type && isEmailOtpType(params.type) ? params.type : "email";
    const { error } = await supabase.auth.verifyOtp({ token_hash: params.tokenHash, type: otpType });
    if (error) {
      return { success: false, type: otpType, errorMessage: AUTH_LINK_ERROR_MESSAGE };
    }
    return { success: true, type: otpType };
  }

  if (params.code) {
    const { error } = await supabase.auth.exchangeCodeForSession(params.code);
    const knownType = params.type && isEmailOtpType(params.type) ? params.type : null;
    if (error) {
      return { success: false, type: knownType, errorMessage: AUTH_LINK_ERROR_MESSAGE };
    }
    return { success: true, type: knownType };
  }

  // Neither a code nor a token_hash arrived — nothing to establish a session from (e.g. someone
  // navigated here directly, or a link was truncated/malformed).
  return { success: false, type: null, errorMessage: AUTH_LINK_ERROR_MESSAGE };
}
