-- Stage B.1: Proper user / coach / admin role separation (see CLAUDE.md / the Stage B.1 task).
--
-- Product model: `user` (regular participant), `coach` (has their own clients — future
-- coach-client functionality, NOT built here), `admin` (platform administrator/owner). A coach
-- must NOT have system-administration privileges (Manual, global scenarios/tools, other coaches,
-- global settings). Stage B reused `is_coach()` for /admin/manual — that was a product-modeling
-- mistake this migration corrects. is_coach() keeps meaning EXACTLY role = 'coach'; it is not
-- redefined to mean "coach or admin" (that would erase the distinction the product now needs for
-- future coach-client authorization). 0017 is already applied to production and is not edited —
-- this migration alters its policies in place via drop+create instead.

-- 1. Widen the role check constraint to allow 'admin', preserving every existing 'user'/'coach'
-- row untouched. 0001_profiles.sql defined the constraint inline (unnamed), so Postgres assigned
-- it the default `profiles_role_check` name — but rather than assume that name is exactly right,
-- look it up by inspecting the actual catalog, so this migration cannot fail on a naming mismatch.
do $$
declare
  existing_constraint text;
begin
  select con.conname into existing_constraint
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'profiles'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) like '%role%';

  if existing_constraint is not null then
    execute format('alter table public.profiles drop constraint %I', existing_constraint);
  end if;
end $$;

alter table public.profiles
  add constraint profiles_role_check check (role in ('user', 'coach', 'admin'));

-- 2. public.is_admin() — same security-definer/stable/search_path pattern as public.is_coach()
-- (0007_rls_policies.sql). True only when the authenticated user's own profile.role = 'admin'.
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

comment on function public.is_admin() is 'True iff auth.uid() is a platform admin (role = ''admin''). Distinct from is_coach() — never redefine is_coach() to mean coach-or-admin.';

-- 4. communication_tools / scenarios: resolved product decision — unpublished/draft global content
-- belongs to platform administration only. A coach may later be able to assign PUBLISHED content
-- to their own clients (future coach-client work, not built here), but must not see draft/inactive
-- rows, and must not mutate this table at all. Final SELECT visibility: active/published rows
-- remain readable by everyone exactly as before (unchanged condition); admin additionally sees
-- every row, including drafts; coach gets no broader visibility than an ordinary user.
--
-- Implemented as two separate SELECT policies rather than one `active = true or is_admin()`
-- condition, because Postgres OR-combines all SELECT policies on a table automatically — this
-- keeps the "published" condition and the "admin sees everything" condition independently
-- readable/auditable instead of merging them into one policy body.
-- Mutation (insert/update/delete) is unambiguously global content administration ("edit global
-- rubrics" / "global scenario/task management" in the product model) — admin only.

drop policy if exists "tools_select_active_or_coach" on public.communication_tools;
drop policy if exists "tools_select_active_or_staff" on public.communication_tools;
create policy "tools_select_active" on public.communication_tools
  for select using (active = true);
create policy "tools_select_admin_all" on public.communication_tools
  for select using (public.is_admin());

drop policy if exists "tools_insert_coach" on public.communication_tools;
create policy "tools_insert_admin" on public.communication_tools
  for insert with check (public.is_admin());

drop policy if exists "tools_update_coach" on public.communication_tools;
create policy "tools_update_admin" on public.communication_tools
  for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists "tools_delete_coach" on public.communication_tools;
create policy "tools_delete_admin" on public.communication_tools
  for delete using (public.is_admin());

drop policy if exists "scenarios_select_active_or_coach" on public.scenarios;
drop policy if exists "scenarios_select_active_or_staff" on public.scenarios;
create policy "scenarios_select_active" on public.scenarios
  for select using (active = true);
create policy "scenarios_select_admin_all" on public.scenarios
  for select using (public.is_admin());

drop policy if exists "scenarios_insert_coach" on public.scenarios;
create policy "scenarios_insert_admin" on public.scenarios
  for insert with check (public.is_admin());

drop policy if exists "scenarios_update_coach" on public.scenarios;
create policy "scenarios_update_admin" on public.scenarios
  for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists "scenarios_delete_coach" on public.scenarios;
create policy "scenarios_delete_admin" on public.scenarios
  for delete using (public.is_admin());

-- 5. manual_versions / manual_blocks: Stage B (0017) authorized these with is_coach(), which was
-- the product-modeling mistake this migration exists to fix. Manual administration is exclusively
-- platform-admin content — replace every is_coach() check with is_admin(). Lifecycle/data-retention
-- rules are unchanged: no delete policy on manual_versions (preserve, don't delete), no update
-- policy on manual_blocks (replaced wholesale on re-parse), ON DELETE RESTRICT and the one-active
-- partial unique index from 0017 are untouched by this migration.

drop policy if exists "manual_versions_select_coach" on public.manual_versions;
create policy "manual_versions_select_admin" on public.manual_versions
  for select using (public.is_admin());

drop policy if exists "manual_versions_insert_coach" on public.manual_versions;
create policy "manual_versions_insert_admin" on public.manual_versions
  for insert with check (public.is_admin());

drop policy if exists "manual_versions_update_coach" on public.manual_versions;
create policy "manual_versions_update_admin" on public.manual_versions
  for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists "manual_blocks_select_coach" on public.manual_blocks;
create policy "manual_blocks_select_admin" on public.manual_blocks
  for select using (public.is_admin());

drop policy if exists "manual_blocks_insert_coach" on public.manual_blocks;
create policy "manual_blocks_insert_admin" on public.manual_blocks
  for insert with check (public.is_admin());

drop policy if exists "manual_blocks_delete_coach" on public.manual_blocks;
create policy "manual_blocks_delete_admin" on public.manual_blocks
  for delete using (public.is_admin());

-- Not changed by this migration, and deliberately so:
--   - public.is_coach() itself: semantics untouched (role = 'coach' only).
--   - profiles_select_own / profiles_update_own (0007_rls_policies.sql): already role-agnostic —
--     the existing `with check (... role = (select role ... ))` pins role to its CURRENT value on
--     any self-update, which already prevents self-escalation to 'admin' exactly as it already did
--     for 'coach'. No admin-bootstrap path is added here; see the Stage B.1 report for the
--     one-time manual SQL template to run after this migration is applied.
