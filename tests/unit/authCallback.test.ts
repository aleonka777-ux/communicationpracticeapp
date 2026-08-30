import { describe, expect, it, vi } from "vitest";
import { completeAuthCallback, AUTH_LINK_ERROR_MESSAGE } from "@/lib/auth/callback";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";

function fakeSupabase(overrides: {
  verifyOtp?: ReturnType<typeof vi.fn>;
  exchangeCodeForSession?: ReturnType<typeof vi.fn>;
}): SupabaseClient<Database> {
  return {
    auth: {
      verifyOtp: overrides.verifyOtp ?? vi.fn(async () => ({ error: null })),
      exchangeCodeForSession: overrides.exchangeCodeForSession ?? vi.fn(async () => ({ error: null })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("Test C — callback success", () => {
  it("verifies a token_hash + type=recovery link and reports type recovery", async () => {
    const verifyOtp = vi.fn(async () => ({ error: null }));
    const supabase = fakeSupabase({ verifyOtp });

    const result = await completeAuthCallback(supabase, { tokenHash: "th_123", type: "recovery" });

    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: "th_123", type: "recovery" });
    expect(result).toEqual({ success: true, type: "recovery" });
  });

  it("exchanges a PKCE code and reports success with no type when none was supplied", async () => {
    const exchangeCodeForSession = vi.fn(async () => ({ error: null }));
    const supabase = fakeSupabase({ exchangeCodeForSession });

    const result = await completeAuthCallback(supabase, { code: "abc123" });

    expect(exchangeCodeForSession).toHaveBeenCalledWith("abc123");
    expect(result).toEqual({ success: true, type: null });
  });

  it("prefers token_hash handling when both a token_hash and a code are somehow present", async () => {
    const verifyOtp = vi.fn(async () => ({ error: null }));
    const exchangeCodeForSession = vi.fn(async () => ({ error: null }));
    const supabase = fakeSupabase({ verifyOtp, exchangeCodeForSession });

    await completeAuthCallback(supabase, { tokenHash: "th_123", type: "magiclink", code: "abc123" });

    expect(verifyOtp).toHaveBeenCalledOnce();
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("defaults an unrecognized/missing type on a token_hash link to the generic 'email' OTP type rather than rejecting it outright", async () => {
    const verifyOtp = vi.fn(async () => ({ error: null }));
    const supabase = fakeSupabase({ verifyOtp });

    await completeAuthCallback(supabase, { tokenHash: "th_123", type: "not_a_real_type" });

    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: "th_123", type: "email" });
  });
});

describe("Test D — callback error", () => {
  it("reports failure with a friendly message when verifyOtp fails (expired/used link)", async () => {
    const verifyOtp = vi.fn(async () => ({ error: { message: "Token has expired or is invalid" } }));
    const supabase = fakeSupabase({ verifyOtp });

    const result = await completeAuthCallback(supabase, { tokenHash: "th_expired", type: "recovery" });

    expect(result.success).toBe(false);
    expect(result.errorMessage).toBe(AUTH_LINK_ERROR_MESSAGE);
    // Never leaks the raw Supabase error text (which could differ run to run / include internals).
    expect(result.errorMessage).not.toContain("Token has expired");
  });

  it("reports failure when exchangeCodeForSession fails", async () => {
    const exchangeCodeForSession = vi.fn(async () => ({ error: { message: "invalid request: both auth code and code verifier should be non-empty" } }));
    const supabase = fakeSupabase({ exchangeCodeForSession });

    const result = await completeAuthCallback(supabase, { code: "bad-code" });

    expect(result.success).toBe(false);
    expect(result.errorMessage).toBe(AUTH_LINK_ERROR_MESSAGE);
  });

  it("reports failure immediately when Supabase's own redirect already carried an error param, without attempting any exchange", async () => {
    const verifyOtp = vi.fn(async () => ({ error: null }));
    const exchangeCodeForSession = vi.fn(async () => ({ error: null }));
    const supabase = fakeSupabase({ verifyOtp, exchangeCodeForSession });

    const result = await completeAuthCallback(supabase, { error: "access_denied", code: "abc" });

    expect(result.success).toBe(false);
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("reports failure when neither a code nor a token_hash arrived (malformed/missing link data)", async () => {
    const supabase = fakeSupabase({});
    const result = await completeAuthCallback(supabase, {});
    expect(result).toEqual({ success: false, type: null, errorMessage: AUTH_LINK_ERROR_MESSAGE });
  });
});
