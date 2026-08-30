"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sanitizeNextPath } from "@/lib/auth/redirect";
import { getSiteOrigin } from "@/lib/auth/origin";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/constants";

export interface AuthActionState {
  error: string | null;
}

const EMAIL_SHAPE_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function readableAuthError(message: string): string {
  if (message.toLowerCase().includes("invalid login credentials")) {
    return "That email and password don't match an account. Check for typos or sign up below.";
  }
  if (message.toLowerCase().includes("already registered") || message.toLowerCase().includes("already exists")) {
    return "An account with that email already exists. Try logging in instead.";
  }
  if (message.toLowerCase().includes("password")) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  return "Something went wrong. Please try again.";
}

export async function signUpAction(_prev: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const displayName = String(formData.get("displayName") ?? "").trim();

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName || email.split("@")[0] } },
  });

  if (error) {
    return { error: readableAuthError(error.message) };
  }

  revalidatePath("/", "layout");
  redirect("/home");
}

export async function logInAction(_prev: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = sanitizeNextPath(String(formData.get("next") ?? ""), "/home");

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: readableAuthError(error.message) };
  }

  revalidatePath("/", "layout");
  redirect(next);
}

export async function logOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}

export interface ForgotPasswordState {
  /** Only ever a client-side input-format problem (e.g. not email-shaped) — never reveals
   *  whether an account exists for the address, see CLAUDE.md Stage B.2 "do not reveal whether
   *  an account exists". */
  error: string | null;
  submitted: boolean;
}

/**
 * Always returns the same neutral outcome to the client regardless of whether Supabase actually
 * found an account for this email — account enumeration is not exposed. Any real Supabase error
 * (rate limit, provider outage) is only logged server-side, never surfaced to the caller.
 */
export async function requestPasswordResetAction(
  _prev: ForgotPasswordState,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const email = String(formData.get("email") ?? "").trim();

  if (!email || !EMAIL_SHAPE_RE.test(email)) {
    return { error: "Enter a valid email address.", submitted: false };
  }

  const supabase = await createClient();
  const origin = await getSiteOrigin();

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=${encodeURIComponent("/auth/update-password")}`,
  });

  if (error) {
    // Never logs the email address or any token — see CLAUDE.md "Transcripts are sensitive" /
    // Stage B.2 "recovery tokens/codes are not logged".
    console.error("[auth:password-reset] resetPasswordForEmail failed", { code: error.status ?? null });
  }

  return { error: null, submitted: true };
}

export interface UpdatePasswordState {
  error: string | null;
  success: boolean;
}

/**
 * Requires an already-established Supabase session (the recovery session created by
 * /auth/callback) — this is never an unauthenticated "set anyone's password" endpoint. See
 * src/app/auth/update-password/page.tsx, which additionally refuses to render the form at all
 * without a session.
 */
export async function updatePasswordAction(
  _prev: UpdatePasswordState,
  formData: FormData,
): Promise<UpdatePasswordState> {
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (password.length < PASSWORD_MIN_LENGTH) {
    return { error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`, success: false };
  }
  if (password !== confirmPassword) {
    return { error: "Passwords don't match.", success: false };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Your recovery session has expired. Request a new reset link.", success: false };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return { error: readableAuthError(error.message), success: false };
  }

  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login?resetSuccess=1");
}
