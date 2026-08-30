import { beforeEach, describe, expect, it, vi } from "vitest";

const resetPasswordForEmail = vi.fn<
  (email: string, options: { redirectTo: string }) => Promise<{ error: { message: string; status?: number } | null }>
>(async () => ({ error: null }));
const updateUser = vi.fn(async () => ({ error: null as { message: string } | null }));
const getUser = vi.fn(async () => ({ data: { user: null as { id: string } | null } }));
const signOut = vi.fn(async () => ({ error: null }));
const signInWithPassword = vi.fn(async () => ({ error: null as { message: string } | null }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { resetPasswordForEmail, updateUser, getUser, signOut, signInWithPassword },
  }),
}));

vi.mock("@/lib/auth/origin", () => ({
  getSiteOrigin: async () => "https://example.test",
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// next/navigation's redirect() throws a special NEXT_REDIRECT digest in real Next.js; mirror
// that here (throw a distinguishable marker) so callers under test still stop executing exactly
// like they would in production, and tests can assert on where they were sent.
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

import {
  requestPasswordResetAction,
  updatePasswordAction,
  logInAction,
  type ForgotPasswordState,
  type UpdatePasswordState,
  type AuthActionState,
} from "@/lib/auth/actions";
import { NEUTRAL_RESET_NOTE, PASSWORD_MIN_LENGTH } from "@/lib/auth/constants";

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

const forgotInitial: ForgotPasswordState = { error: null, submitted: false };
const updateInitial: UpdatePasswordState = { error: null, success: false };
const loginInitial: AuthActionState = { error: null };

beforeEach(() => {
  vi.clearAllMocks();
  resetPasswordForEmail.mockResolvedValue({ error: null });
  updateUser.mockResolvedValue({ error: null });
  getUser.mockResolvedValue({ data: { user: null } });
  signOut.mockResolvedValue({ error: null });
  signInWithPassword.mockResolvedValue({ error: null });
});

describe("Test A — forgot-password request", () => {
  it("a valid email-shaped input issues a recovery request and returns the neutral outcome", async () => {
    const result = await requestPasswordResetAction(forgotInitial, formData({ email: "user@example.com" }));

    expect(resetPasswordForEmail).toHaveBeenCalledOnce();
    const [email, options] = resetPasswordForEmail.mock.calls[0];
    expect(email).toBe("user@example.com");
    expect(options.redirectTo).toBe("https://example.test/auth/callback?next=%2Fauth%2Fupdate-password");
    expect(result).toEqual({ error: null, submitted: true });
  });

  it("the public response stays neutral even when Supabase reports an error", async () => {
    resetPasswordForEmail.mockResolvedValue({ error: { message: "User not found", status: 400 } });

    const result = await requestPasswordResetAction(forgotInitial, formData({ email: "nobody@example.com" }));

    // Never reveals account existence — same shape as the success path.
    expect(result).toEqual({ error: null, submitted: true });
  });

  it("the neutral message itself never claims or denies the account exists", () => {
    expect(NEUTRAL_RESET_NOTE.toLowerCase()).not.toContain("not registered");
    expect(NEUTRAL_RESET_NOTE.toLowerCase()).toContain("if an account exists");
  });
});

describe("Test B — invalid email input", () => {
  it("rejects an empty email without calling Supabase", async () => {
    const result = await requestPasswordResetAction(forgotInitial, formData({ email: "" }));
    expect(result).toEqual({ error: "Enter a valid email address.", submitted: false });
    expect(resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it("rejects a non-email-shaped input without calling Supabase", async () => {
    const result = await requestPasswordResetAction(forgotInitial, formData({ email: "not-an-email" }));
    expect(result.error).toBe("Enter a valid email address.");
    expect(resetPasswordForEmail).not.toHaveBeenCalled();
  });
});

describe("Test F — new password validation", () => {
  it("rejects a password/confirmation mismatch", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });

    const result = await updatePasswordAction(
      updateInitial,
      formData({ password: "goodpass1", confirmPassword: "different1" }),
    );

    expect(result).toEqual({ error: "Passwords don't match.", success: false });
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("rejects a too-short password", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const short = "a".repeat(PASSWORD_MIN_LENGTH - 1);

    const result = await updatePasswordAction(updateInitial, formData({ password: short, confirmPassword: short }));

    expect(result.error).toMatch(new RegExp(`at least ${PASSWORD_MIN_LENGTH}`));
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("calls updateUser and then signs out + redirects to login on valid matching passwords", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const password = "a".repeat(PASSWORD_MIN_LENGTH);

    await expect(
      updatePasswordAction(updateInitial, formData({ password, confirmPassword: password })),
    ).rejects.toThrow("REDIRECT:/login?resetSuccess=1");

    expect(updateUser).toHaveBeenCalledWith({ password });
    expect(signOut).toHaveBeenCalledOnce();
  });
});

describe("Test G — no session cannot update a password", () => {
  it("refuses to update the password when there is no authenticated recovery session", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const password = "a".repeat(PASSWORD_MIN_LENGTH);

    const result = await updatePasswordAction(updateInitial, formData({ password, confirmPassword: password }));

    expect(result.success).toBe(false);
    expect(updateUser).not.toHaveBeenCalled();
  });
});

describe("Test H — existing login regression", () => {
  it("still signs in with email/password and redirects to the sanitized next path unchanged", async () => {
    await expect(
      logInAction(loginInitial, formData({ email: "user@example.com", password: "secret1", next: "/practice/setup/abc" })),
    ).rejects.toThrow("REDIRECT:/practice/setup/abc");

    expect(signInWithPassword).toHaveBeenCalledWith({ email: "user@example.com", password: "secret1" });
  });

  it("falls back to /home for an unsafe next value instead of erroring", async () => {
    await expect(
      logInAction(loginInitial, formData({ email: "user@example.com", password: "secret1", next: "https://evil.example" })),
    ).rejects.toThrow("REDIRECT:/home");
  });

  it("still surfaces a readable error on invalid credentials without redirecting", async () => {
    signInWithPassword.mockResolvedValue({ error: { message: "Invalid login credentials" } });

    const result = await logInAction(loginInitial, formData({ email: "user@example.com", password: "wrong" }));

    expect(result.error).toMatch(/don't match an account/);
  });

  it("requires both email and password", async () => {
    const result = await logInAction(loginInitial, formData({ email: "", password: "" }));
    expect(result.error).toBe("Email and password are required.");
    expect(signInWithPassword).not.toHaveBeenCalled();
  });
});
