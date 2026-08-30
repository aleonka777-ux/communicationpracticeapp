-- Stage B: Versioned Communication Manual Infrastructure (see CLAUDE.md / /docs/DECISIONS.md).
-- Purely additive: two new tables, no existing table touched. Lets a coach upload a Manual
-- Markdown source, have it parsed into atomic retrievable blocks, and structurally validated —
-- WITHOUT connecting the Manual to the evaluator (no RAG/embeddings/retrieval integration here).
--
-- Lifecycle: draft -> parsed -> validated -> active -> archived. All five states are represented
-- now so a future stage does not need another migration just to add a status value, but this
-- stage's application code only ever performs draft -> parsed. "parsed" means the Markdown was
-- syntactically parsed into blocks and structurally validated — it does NOT mean the Manual's
-- methodology has been validated against the evaluator. That is a distinct, later transition.

create table if not exists public.manual_versions (
  id uuid primary key default gen_random_uuid(),
  -- The whole Manual's version, e.g. '2.1.1'. A block never has an independent version — see
  -- manual_blocks below. At most one canonical row per version_label (enforced below): re-uploading
  -- identical content returns the existing row; re-uploading different content under the same label
  -- is rejected as an immutability violation at the application layer (src/lib/db/manual.ts).
  version_label text not null,
  status text not null default 'draft' check (status in ('draft', 'parsed', 'validated', 'active', 'archived')),
  source_filename text not null,
  -- Full uploaded Markdown source, verbatim. Storing it here (not just a path) means the app does
  -- not depend on GitHub or a Vercel deployment to have a given Manual version available.
  source_markdown text not null,
  -- SHA-256 of source_markdown, computed server-side, for deterministic exact-duplicate detection.
  source_sha256 text not null,
  -- Which parser CONTRACT produced manual_blocks for this version (e.g. 'manual-parser-v1').
  -- Deliberately decoupled from version_label: the same Manual version may be re-parsed by a later
  -- parser contract without that being a new methodology version.
  parser_version text,
  block_count integer not null default 0,
  -- Structural/reference validation diagnostics for the most recent parse attempt (counts,
  -- duplicate ids, unresolved references, warnings, errors — see src/lib/manual/validator.ts).
  -- Not a separate table: one parse produces one report, read far more often than queried into.
  parse_report jsonb,
  -- Document metadata read FROM the Manual's own source text (its '**Version:**'/'**Status:**'/
  -- '**Author:**'/'**Updated:**' header lines) for preview only. The document's own textual
  -- Status (e.g. "Implementation-ready methodology contract for V1") is a different concept from
  -- this row's lifecycle `status` column above and must never be confused with it.
  document_metadata jsonb,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  parsed_at timestamptz,
  validated_at timestamptz,
  activated_at timestamptz,
  archived_at timestamptz
);

comment on table public.manual_versions is 'Stage B: one row per uploaded Communication Manual source version. See CLAUDE.md "The two AI roles" and /docs/manual — this table stores methodology source material, not evaluator wiring.';
comment on column public.manual_versions.parser_version is 'Which parser contract produced manual_blocks, e.g. manual-parser-v1. Not the Manual''s own version_label.';
comment on column public.manual_versions.status is 'draft: uploaded, not yet successfully parsed. parsed: syntactically parsed + structurally validated (NOT methodology-validated). validated/active/archived: reserved for a later stage; Stage B application code never transitions a row into these.';

create unique index if not exists manual_versions_version_label_key on public.manual_versions (version_label);
create unique index if not exists manual_versions_source_sha256_key on public.manual_versions (source_sha256);
create index if not exists manual_versions_status_idx on public.manual_versions (status);

-- DB-level invariant for the future activation stage (not implemented yet — see the lifecycle note
-- above): at most one manual_versions row may be `active` at a time. A partial unique index, not a
-- CHECK constraint or application-code guard, because the "at most one" rule spans rows — every row
-- indexed here has the same status value ('active'), so uniqueness on that column is equivalent to
-- "at most one row total" satisfies the predicate. Any number of draft/parsed/validated/archived
-- rows remain unrestricted.
create unique index if not exists manual_versions_one_active_idx
  on public.manual_versions (status)
  where status = 'active';

alter table public.manual_versions enable row level security;

create trigger manual_versions_set_updated_at
  before update on public.manual_versions
  for each row execute function public.set_updated_at();

create table if not exists public.manual_blocks (
  id uuid primary key default gen_random_uuid(),
  -- ON DELETE RESTRICT, not CASCADE: manual_versions are historical methodology artifacts (see the
  -- data-retention note above and the no-delete-policy note below) — deleting a version row must
  -- never silently take its parsed blocks with it. There is no delete UI for manual_versions in any
  -- stage, and RLS grants no delete privilege on it at all, so this constraint is a second,
  -- DB-level guarantee rather than the only protection.
  manual_version_id uuid not null references public.manual_versions (id) on delete restrict,
  -- The Manual's own stable id for this block, e.g. 'safety_02', 'ev_04', 'tool_open_questions'.
  -- Intentionally NOT globally unique: the same block_id persists across Manual versions.
  block_id text not null,
  block_type text,
  title text,
  priority text,
  -- The block's own optional lifecycle-ish status field from its YAML metadata (e.g. 'dormant') —
  -- unrelated to manual_versions.status; see ret_metadata_schema in the Manual itself.
  status text,
  -- Original order of appearance in the source Markdown, for faithful preview ordering.
  ordinal integer not null,
  -- Heading hierarchy the block was found under, e.g. ["3. Evidence and Interpretation Rules",
  -- "3.4 The semantic response unit"], for display only — block_id remains the canonical identity.
  section_path jsonb not null default '[]'::jsonb,
  -- Full parsed YAML metadata mapping for this block. Deliberately one polymorphic jsonb column,
  -- not one database column per Manual metadata field — the Manual's own metadata contract
  -- (ret_metadata_schema) is intentionally polymorphic across block types.
  metadata jsonb not null default '{}'::jsonb,
  -- Complete block body, verbatim Markdown, never rewritten/summarized/chunked.
  body_markdown text not null,
  -- Hash of the block's own canonical parsed content, for future cross-version diffing (no diff UI
  -- yet in this stage).
  content_hash text not null,
  related_block_ids text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (manual_version_id, block_id)
);

comment on table public.manual_blocks is 'Stage B: atomic retrievable blocks parsed from one manual_versions row. Not yet read by the Evaluation Engine — see CLAUDE.md "Explicitly excluded from MVP" / Stage B scope boundary.';
comment on column public.manual_blocks.block_id is 'The Manual''s own stable id (e.g. ev_04). Unique per manual_version_id, intentionally NOT unique globally — the same id persists across versions.';

create index if not exists manual_blocks_manual_version_id_idx on public.manual_blocks (manual_version_id, ordinal);
create index if not exists manual_blocks_block_id_idx on public.manual_blocks (block_id);

alter table public.manual_blocks enable row level security;

-- RLS: Manual administration is coach-only. Reuses public.is_coach() (0007_rls_policies.sql) rather
-- than inventing a new authorization mechanism. Regular users get no policy at all on either table,
-- so RLS denies all access by default — they cannot browse, upload, or edit Manual data even via a
-- direct client query. Server code additionally checks isCoach() explicitly before any mutation
-- (see src/lib/admin/manualActions.ts) — RLS is defense in depth here, not the only check, matching
-- CLAUDE.md "Security constraints".

create policy "manual_versions_select_coach" on public.manual_versions
  for select using (public.is_coach());

create policy "manual_versions_insert_coach" on public.manual_versions
  for insert with check (public.is_coach());

create policy "manual_versions_update_coach" on public.manual_versions
  for update using (public.is_coach()) with check (public.is_coach());

-- No delete policy: manual_versions are historical methodology artifacts. Preserve, do not delete
-- (see Stage B task's data-retention section) — RLS denies delete entirely for now.

create policy "manual_blocks_select_coach" on public.manual_blocks
  for select using (public.is_coach());

create policy "manual_blocks_insert_coach" on public.manual_blocks
  for insert with check (public.is_coach());

create policy "manual_blocks_delete_coach" on public.manual_blocks
  for delete using (public.is_coach());

-- No update policy: a version's blocks are replaced wholesale on re-parse (delete + reinsert,
-- matching the codebase's existing recompute convention — see 0016_semantic_responses.sql), never
-- edited in place. Stage B explicitly does not build a block text editor.
