import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import type { UserRole } from "@/lib/db/types";

/**
 * Stage B.1 — proper user/coach/admin role separation. isAdmin()/isCoach() themselves are
 * exhaustively tested in authorization.test.ts; these tests are the regression guard against the
 * exact mistake Stage B.1 exists to fix — Manual/global-content administration silently gating on
 * isCoach()/requireCoach() again. Static source checks are used deliberately (matching this repo's
 * existing manualMigration.test.ts precedent) because requireAdmin() is an intentionally private,
 * unexported helper in each actions file (mirroring the pre-existing requireCoach() convention) —
 * there is nothing else to import and unit-test directly without duplicating a live Supabase
 * integration harness this repo does not otherwise have.
 */

function readSource(path: string): string {
  return readFileSync(path, "utf8");
}

describe("Manual administration requires admin, not coach", () => {
  const source = readSource("src/lib/admin/manualActions.ts");

  it("gates on isAdmin(profile), not isCoach(profile)", () => {
    expect(source).toMatch(/if\s*\(\s*!isAdmin\(profile\)\s*\)/);
    expect(source).not.toMatch(/if\s*\(\s*!isCoach\(profile\)\s*\)/);
  });

  it("does not call requireCoach() anywhere", () => {
    expect(source).not.toMatch(/requireCoach\s*\(/);
  });

  it("both uploadManualAction and parseManualAction call requireAdmin()", () => {
    const uploadFn = source.slice(source.indexOf("export async function uploadManualAction"));
    const parseFn = source.slice(source.indexOf("export async function parseManualAction"));
    expect(uploadFn).toMatch(/await requireAdmin\(\)/);
    expect(parseFn).toMatch(/await requireAdmin\(\)/);
  });
});

describe("Global tools/scenarios administration requires admin, not coach", () => {
  const source = readSource("src/lib/admin/actions.ts");

  it("gates on isAdmin(profile), not isCoach(profile)", () => {
    expect(source).toMatch(/if\s*\(\s*!isAdmin\(profile\)\s*\)/);
    expect(source).not.toMatch(/if\s*\(\s*!isCoach\(profile\)\s*\)/);
  });

  it("does not call requireCoach() anywhere", () => {
    expect(source).not.toMatch(/requireCoach\s*\(/);
  });

  it("both saveToolAction and saveScenarioAction call requireAdmin()", () => {
    const toolFn = source.slice(source.indexOf("export async function saveToolAction"));
    const scenarioFn = source.slice(
      source.indexOf("export async function saveScenarioAction"),
      source.length,
    );
    expect(toolFn.slice(0, toolFn.indexOf("export async function saveScenarioAction"))).toMatch(/await requireAdmin\(\)/);
    expect(scenarioFn).toMatch(/await requireAdmin\(\)/);
  });
});

describe("/admin namespace guard requires admin, not coach", () => {
  const source = readSource("src/app/admin/layout.tsx");

  it("redirects away unless isAdmin(profile)", () => {
    expect(source).toMatch(/if\s*\(\s*!isAdmin\(profile\)\s*\)\s*redirect\(/);
    expect(source).not.toMatch(/isCoach\(/);
  });
});

describe("Admin navigation is admin-only, not coach-visible", () => {
  it("BottomNav's admin entry is gated by an isAdmin prop, not isCoach", () => {
    const source = readSource("src/components/layout/bottom-nav.tsx");
    expect(source).toMatch(/isAdmin/);
    expect(source).not.toMatch(/isCoach/);
  });

  it("the authenticated app shell passes isAdmin(profile) to BottomNav", () => {
    const source = readSource("src/app/(app)/layout.tsx");
    expect(source).toMatch(/<BottomNav isAdmin=\{isAdmin\(profile\)\}/);
  });
});

describe("Migration 0018 — Manual RLS moves from is_coach() to is_admin()", () => {
  const migration = readSource("supabase/migrations/0018_admin_role.sql");

  it("widens the role check constraint to include admin, preserving user/coach", () => {
    expect(migration).toMatch(/check \(role in \('user', 'coach', 'admin'\)\)/);
  });

  it("defines public.is_admin() following the is_coach() security-definer pattern", () => {
    expect(migration).toMatch(/create or replace function public\.is_admin\(\)/);
    expect(migration).toMatch(/create or replace function public\.is_admin\(\)[\s\S]*?security definer/);
    expect(migration).toMatch(/create or replace function public\.is_admin\(\)[\s\S]*?set search_path = public/);
  });

  it("drops every Stage B is_coach() Manual policy and replaces it with an is_admin() policy", () => {
    for (const table of ["manual_versions", "manual_blocks"]) {
      const dropCount = (migration.match(new RegExp(`drop policy if exists "${table}_\\w+_coach" on public\\.${table}`, "g")) ?? []).length;
      expect(dropCount).toBeGreaterThan(0);
    }
    // No new policy on either Manual table references is_coach().
    const manualPolicyBlock = migration.slice(migration.indexOf("-- 5. manual_versions"));
    const newPolicies = manualPolicyBlock.match(/create policy "manual_\w+" on public\.manual_\w+[\s\S]*?;/g) ?? [];
    expect(newPolicies.length).toBeGreaterThan(0);
    for (const policy of newPolicies) {
      expect(policy).toMatch(/public\.is_admin\(\)/);
      expect(policy).not.toMatch(/public\.is_coach\(\)/);
    }
  });

  it("moves communication_tools/scenarios mutation policies to is_admin()", () => {
    for (const table of ["tools", "scenarios"]) {
      const insertPolicy = migration.match(new RegExp(`create policy "${table}_insert_admin"[\\s\\S]*?;`));
      const updatePolicy = migration.match(new RegExp(`create policy "${table}_update_admin"[\\s\\S]*?;`));
      const deletePolicy = migration.match(new RegExp(`create policy "${table}_delete_admin"[\\s\\S]*?;`));
      expect(insertPolicy?.[0]).toMatch(/public\.is_admin\(\)/);
      expect(updatePolicy?.[0]).toMatch(/public\.is_admin\(\)/);
      expect(deletePolicy?.[0]).toMatch(/public\.is_admin\(\)/);
    }
  });

  it("splits communication_tools/scenarios SELECT into an unchanged 'published' policy and a separate admin-sees-all policy (Postgres OR-combines multiple SELECT policies)", () => {
    for (const table of ["tools", "scenarios"]) {
      const publishedPolicy = migration.match(new RegExp(`create policy "${table}_select_active" on public\\.\\w+[\\s\\S]*?;`));
      const adminAllPolicy = migration.match(new RegExp(`create policy "${table}_select_admin_all" on public\\.\\w+[\\s\\S]*?;`));
      expect(publishedPolicy?.[0]).toMatch(/for select using \(active = true\)/);
      expect(publishedPolicy?.[0]).not.toMatch(/is_coach|is_admin|is_staff/);
      expect(adminAllPolicy?.[0]).toMatch(/public\.is_admin\(\)/);
    }
  });

  it("no longer defines or references is_staff() anywhere", () => {
    expect(migration).not.toMatch(/is_staff/);
  });

  it("does not edit already-applied migration 0017", () => {
    // Sentinel: 0017's original coach-authored RLS comment block is untouched.
    const migration0017 = readSource("supabase/migrations/0017_manual_infrastructure.sql");
    expect(migration0017).toMatch(/RLS: Manual administration is coach-only/);
  });
});

/**
 * Pure-logic mirror of the resolved product decision (Stage B.1 cleanup): active/published global
 * tools/scenarios remain readable by everyone; only admin can additionally read inactive/draft
 * rows; only admin can mutate. This mirrors the migration's two OR-combined SELECT policies
 * (`active = true` OR `is_admin()`) — there is no live Supabase project to assert the actual RLS
 * behavior against, matching this repo's existing testing conventions.
 */
function canSelectGlobalContent(role: UserRole, active: boolean): boolean {
  return active || role === "admin";
}

function canMutateGlobalContent(role: UserRole): boolean {
  return role === "admin";
}

describe("Global content row-level visibility matrix (communication_tools / scenarios)", () => {
  const roles: UserRole[] = ["user", "coach", "admin"];

  it.each(roles)("%s can select active/published rows", (role) => {
    expect(canSelectGlobalContent(role, true)).toBe(true);
  });

  it("user cannot select inactive/draft rows", () => {
    expect(canSelectGlobalContent("user", false)).toBe(false);
  });

  it("coach cannot select inactive/draft rows", () => {
    expect(canSelectGlobalContent("coach", false)).toBe(false);
  });

  it("admin can select inactive/draft rows", () => {
    expect(canSelectGlobalContent("admin", false)).toBe(true);
  });

  it("user cannot mutate global content", () => {
    expect(canMutateGlobalContent("user")).toBe(false);
  });

  it("coach cannot mutate global content", () => {
    expect(canMutateGlobalContent("coach")).toBe(false);
  });

  it("admin can mutate global content", () => {
    expect(canMutateGlobalContent("admin")).toBe(true);
  });
});
