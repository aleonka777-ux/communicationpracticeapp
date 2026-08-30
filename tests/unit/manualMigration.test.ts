import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

/**
 * Migration 0017 has not been applied anywhere (repository-only, per the Stage B task) — there is
 * no live Supabase project to assert these DB-level invariants against, and this repo has no
 * migration-integration test framework. These tests assert the invariants directly against the
 * migration's SQL text instead, matching the Stage B cleanup task's own guidance not to introduce
 * one just for this.
 */
const MIGRATION_PATH = "supabase/migrations/0017_manual_infrastructure.sql";
const migrationSql = readFileSync(MIGRATION_PATH, "utf8");

describe("Test 7 — manual_blocks does not cascade-delete on its parent manual_versions row", () => {
  it("the manual_version_id foreign key is not ON DELETE CASCADE", () => {
    const fkLine = migrationSql
      .split("\n")
      .find((line) => line.includes("manual_version_id uuid not null references public.manual_versions"));
    expect(fkLine).toBeDefined();
    expect(fkLine).not.toMatch(/on delete cascade/i);
  });

  it("the manual_version_id foreign key is explicitly ON DELETE RESTRICT", () => {
    const fkLine = migrationSql
      .split("\n")
      .find((line) => line.includes("manual_version_id uuid not null references public.manual_versions"));
    expect(fkLine).toMatch(/on delete restrict/i);
  });
});

describe("Test 8 — at most one active Manual is enforced at the database level", () => {
  it("declares a partial unique index scoped to status = 'active'", () => {
    expect(migrationSql).toMatch(/create unique index[^;]*on public\.manual_versions \(status\)\s*\n\s*where status = 'active';/);
  });

  it("does not rely on a plain (non-partial) unique constraint on status, which would forbid multiple drafts/parsed/archived rows", () => {
    const activeIndexMatch = migrationSql.match(/create unique index if not exists manual_versions_one_active_idx[\s\S]*?;/);
    expect(activeIndexMatch).not.toBeNull();
    expect(activeIndexMatch?.[0]).toMatch(/where status = 'active'/);
  });
});
