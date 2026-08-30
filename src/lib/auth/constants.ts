/**
 * Plain constants shared between src/lib/auth/actions.ts (a "use server" file, which may only
 * export async functions — see Next.js's server-actions rule) and the client form components
 * that need the same values.
 */

/** Matches the signup/login form's existing `minLength={6}` — see components/auth/auth-form.tsx. */
export const PASSWORD_MIN_LENGTH = 6;

export const NEUTRAL_RESET_NOTE =
  "If an account exists for this email, we sent a password reset link. Check your inbox (and spam folder).";
