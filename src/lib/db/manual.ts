import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, ManualBlockRow, ManualVersionRow } from "@/lib/db/types";

export async function listManualVersions(supabase: SupabaseClient<Database>): Promise<ManualVersionRow[]> {
  const { data, error } = await supabase
    .from("manual_versions")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getManualVersionById(
  supabase: SupabaseClient<Database>,
  id: string,
): Promise<ManualVersionRow | null> {
  const { data, error } = await supabase.from("manual_versions").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function getManualVersionBySha256(
  supabase: SupabaseClient<Database>,
  sha256: string,
): Promise<ManualVersionRow | null> {
  const { data, error } = await supabase
    .from("manual_versions")
    .select("*")
    .eq("source_sha256", sha256)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getManualVersionByLabel(
  supabase: SupabaseClient<Database>,
  versionLabel: string,
): Promise<ManualVersionRow | null> {
  const { data, error } = await supabase
    .from("manual_versions")
    .select("*")
    .eq("version_label", versionLabel)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export interface CreateDraftManualVersionInput {
  version_label: string;
  source_filename: string;
  source_markdown: string;
  source_sha256: string;
  document_metadata: Record<string, unknown> | null;
  created_by: string | null;
}

export async function createDraftManualVersion(
  supabase: SupabaseClient<Database>,
  input: CreateDraftManualVersionInput,
): Promise<ManualVersionRow> {
  const { data, error } = await supabase
    .from("manual_versions")
    .insert({ ...input, status: "draft" })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function listManualBlocks(
  supabase: SupabaseClient<Database>,
  manualVersionId: string,
): Promise<ManualBlockRow[]> {
  const { data, error } = await supabase
    .from("manual_blocks")
    .select("*")
    .eq("manual_version_id", manualVersionId)
    .order("ordinal", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export interface ManualBlockInsert {
  block_id: string;
  block_type: string | null;
  title: string | null;
  priority: string | null;
  status: string | null;
  ordinal: number;
  section_path: string[];
  metadata: Record<string, unknown>;
  body_markdown: string;
  content_hash: string;
  related_block_ids: string[];
}

export interface PersistParseResultInput {
  parserVersion: string;
  blockCount: number;
  parseReport: Record<string, unknown>;
  documentMetadata: Record<string, unknown>;
  blocks: ManualBlockInsert[];
}

/**
 * Replaces a version's stored block set and marks it `parsed`. The caller (see
 * src/lib/manual/parseAndValidate.ts + src/lib/admin/manualActions.ts) has already parsed and
 * structurally validated the full source IN MEMORY before calling this — nothing here re-parses or
 * second-guesses that result. Persistence order is chosen so a failure never leaves the version
 * stuck in a bad, unretryable state: old blocks are deleted, new blocks are inserted, and only then
 * is the version row marked `parsed`. If insertion fails, the version's lifecycle status is
 * untouched and manual_blocks is simply empty for it — retrying "Parse Manual" repeats the same
 * delete+insert and recovers cleanly (no separate DB transaction/RPC is needed for this; the
 * existing delete-then-reinsert convention used by 0016_semantic_responses.sql already gives the
 * same idempotent-retry property).
 */
export async function replaceManualBlocksAndMarkParsed(
  supabase: SupabaseClient<Database>,
  manualVersionId: string,
  input: PersistParseResultInput,
): Promise<ManualVersionRow> {
  const { error: deleteError } = await supabase
    .from("manual_blocks")
    .delete()
    .eq("manual_version_id", manualVersionId);
  if (deleteError) throw deleteError;

  if (input.blocks.length > 0) {
    const rows = input.blocks.map((block) => ({ ...block, manual_version_id: manualVersionId }));
    const { error: insertError } = await supabase.from("manual_blocks").insert(rows);
    if (insertError) throw insertError;
  }

  const { data, error: updateError } = await supabase
    .from("manual_versions")
    .update({
      status: "parsed",
      parser_version: input.parserVersion,
      block_count: input.blockCount,
      parse_report: input.parseReport,
      document_metadata: input.documentMetadata,
      parsed_at: new Date().toISOString(),
    })
    .eq("id", manualVersionId)
    .select("*")
    .single();
  if (updateError) throw updateError;
  return data;
}

/**
 * Parsing failed fatally (see ManualValidationReport.fatal) — persist the diagnostic report but
 * leave the version at `draft` and its block set untouched, per Stage B's "parsing status
 * semantics" (parsed must never be a lie about what actually happened).
 */
export async function recordFailedParseAttempt(
  supabase: SupabaseClient<Database>,
  manualVersionId: string,
  parseReport: Record<string, unknown>,
): Promise<ManualVersionRow> {
  const { data, error } = await supabase
    .from("manual_versions")
    .update({ parse_report: parseReport })
    .eq("id", manualVersionId)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}
