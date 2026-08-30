import { describe, expect, it } from "vitest";
import { isAdmin, isCoach } from "@/lib/db/profiles";
import { ApiError, requireOwnedSession } from "@/lib/practice/authorize";
import type { PracticeSessionRow, ProfileRow, UserRole } from "@/lib/db/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";

function profile(role: UserRole): ProfileRow {
  return { id: "u1", display_name: "Test", role, created_at: "", updated_at: "" };
}

describe("isCoach", () => {
  it("is true only for a coach profile — never true for admin (see Stage B.1: is_coach() is never redefined to mean coach-or-admin)", () => {
    expect(isCoach(profile("coach"))).toBe(true);
    expect(isCoach(profile("user"))).toBe(false);
    expect(isCoach(profile("admin"))).toBe(false);
  });

  it("is false when there is no profile", () => {
    expect(isCoach(null)).toBe(false);
  });
});

describe("isAdmin (Stage B.1 — proper user/coach/admin role separation)", () => {
  it("is true only for an admin profile — never true for coach", () => {
    expect(isAdmin(profile("admin"))).toBe(true);
    expect(isAdmin(profile("user"))).toBe(false);
    expect(isAdmin(profile("coach"))).toBe(false);
  });

  it("is false when there is no profile", () => {
    expect(isAdmin(null)).toBe(false);
  });

  it("isCoach and isAdmin are mutually exclusive for every role", () => {
    const roles: UserRole[] = ["user", "coach", "admin"];
    for (const role of roles) {
      const p = profile(role);
      expect(isCoach(p) && isAdmin(p)).toBe(false);
    }
  });
});

describe("role contract", () => {
  it("user, coach, and admin are all valid ProfileRow roles (type-level contract)", () => {
    const roles: UserRole[] = ["user", "coach", "admin"];
    expect(roles).toEqual(["user", "coach", "admin"]);
    // Constructing a ProfileRow for each is itself the compile-time assertion that these three
    // string literals — and only these — satisfy the UserRole type.
    for (const role of roles) {
      expect(profile(role).role).toBe(role);
    }
  });
});

describe("ApiError", () => {
  it("carries the intended HTTP status for route handlers to map to a response", () => {
    const err = new ApiError(404, "Practice session not found.");
    expect(err.status).toBe(404);
    expect(err.message).toBe("Practice session not found.");
    expect(err).toBeInstanceOf(Error);
  });
});

function fakeSupabase(userId: string | null, session: Partial<PracticeSessionRow> | null): SupabaseClient<Database> {
  return {
    auth: {
      getUser: async () => ({ data: { user: userId ? { id: userId } : null } }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: session, error: null }),
        }),
      }),
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("requireOwnedSession", () => {
  it("rejects with 401 when there is no authenticated user", async () => {
    const supabase = fakeSupabase(null, null);
    await expect(requireOwnedSession(supabase, "session-1")).rejects.toMatchObject({ status: 401 });
  });

  it("rejects with 404 when the session belongs to a different user", async () => {
    const supabase = fakeSupabase("user-a", { id: "session-1", user_id: "user-b" });
    await expect(requireOwnedSession(supabase, "session-1")).rejects.toMatchObject({ status: 404 });
  });

  it("rejects with 404 when the session does not exist", async () => {
    const supabase = fakeSupabase("user-a", null);
    await expect(requireOwnedSession(supabase, "missing")).rejects.toMatchObject({ status: 404 });
  });

  it("succeeds when the authenticated user owns the session", async () => {
    const supabase = fakeSupabase("user-a", { id: "session-1", user_id: "user-a", status: "in_progress" });
    const result = await requireOwnedSession(supabase, "session-1");
    expect(result.userId).toBe("user-a");
    expect(result.session.id).toBe("session-1");
  });
});
