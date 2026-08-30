"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, isAdmin } from "@/lib/db/profiles";
import {
  createDraftManualVersion,
  getManualVersionById,
  getManualVersionByLabel,
  getManualVersionBySha256,
  recordFailedParseAttempt,
  replaceManualBlocksAndMarkParsed,
} from "@/lib/db/manual";
import { extractDocumentMetadata } from "@/lib/manual/parser";
import { parseAndValidateManual } from "@/lib/manual/parseAndValidate";
import { sha256Hex } from "@/lib/manual/hash";
import { isStageBAllowedTransition, type ManualLifecycleStatus } from "@/lib/manual/lifecycle";

// Manual administration is platform administration, not coach functionality (see CLAUDE.md / the
// Stage B.1 task's product model) — a coach must not be able to upload/parse the Manual, so this
// checks isAdmin(), not isCoach().
async function requireAdmin() {
  const supabase = await createClient();
  const profile = await getCurrentProfile(supabase);
  if (!isAdmin(profile)) {
    throw new Error("Only admin accounts can manage the Communication Manual.");
  }
  return { supabase, profile };
}

/**
 * Creates a new draft manual_versions row from an uploaded .md file. Duplicate-upload handling
 * (see Stage B task): exact-content re-uploads resolve to the existing version instead of creating
 * a new row; a same-version-label upload with DIFFERENT content is rejected outright — a
 * methodology version is immutable once represented in the system.
 */
export async function uploadManualAction(formData: FormData): Promise<void> {
  const { supabase, profile } = await requireAdmin();

  const file = formData.get("source");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Choose a .md file to upload.");
  }

  const sourceMarkdown = await file.text();
  const sourceSha256 = sha256Hex(sourceMarkdown);

  const existingByHash = await getManualVersionBySha256(supabase, sourceSha256);
  if (existingByHash) {
    revalidatePath("/admin/manual");
    redirect(`/admin/manual/${existingByHash.id}?duplicate=1`);
  }

  const documentMetadata = extractDocumentMetadata(sourceMarkdown);
  const versionLabel = documentMetadata.versionLabel;
  if (!versionLabel) {
    throw new Error("Could not find a '**Version:** ...' line in the uploaded Markdown — a version label is required.");
  }

  const existingByLabel = await getManualVersionByLabel(supabase, versionLabel);
  if (existingByLabel) {
    throw new Error(
      `Manual version "${versionLabel}" already exists with different content. A methodology version is immutable once uploaded — increment the version number in the Manual source and upload it as a new version.`,
    );
  }

  const created = await createDraftManualVersion(supabase, {
    version_label: versionLabel,
    source_filename: file.name,
    source_markdown: sourceMarkdown,
    source_sha256: sourceSha256,
    document_metadata: documentMetadata as unknown as Record<string, unknown>,
    created_by: profile?.id ?? null,
  });

  revalidatePath("/admin/manual");
  redirect(`/admin/manual/${created.id}`);
}

/**
 * Deterministically parses and structurally validates a draft/parsed version's stored source, then
 * (only if parsing did not hit a fatal structural error — see ManualValidationReport.fatal) replaces
 * its block set and marks it `parsed`. Safe to re-run: parsing/validation happens fully in memory
 * before anything is persisted (see src/lib/manual/parseAndValidate.ts).
 */
export async function parseManualAction(formData: FormData): Promise<void> {
  const { supabase } = await requireAdmin();

  const versionId = String(formData.get("id") ?? "").trim();
  if (!versionId) throw new Error("Missing manual version id.");

  const version = await getManualVersionById(supabase, versionId);
  if (!version) throw new Error("Manual version not found.");

  if (!isStageBAllowedTransition(version.status as ManualLifecycleStatus, "parsed")) {
    throw new Error(
      `This Manual version's lifecycle status ("${version.status}") does not permit parsing in this stage.`,
    );
  }

  const result = parseAndValidateManual(version.source_markdown);

  if (result.report.fatal) {
    await recordFailedParseAttempt(supabase, versionId, result.report as unknown as Record<string, unknown>);
  } else {
    await replaceManualBlocksAndMarkParsed(supabase, versionId, {
      parserVersion: result.parserVersion,
      blockCount: result.blockRows.length,
      parseReport: result.report as unknown as Record<string, unknown>,
      documentMetadata: result.documentMetadata as unknown as Record<string, unknown>,
      blocks: result.blockRows,
    });
  }

  revalidatePath("/admin/manual");
  revalidatePath(`/admin/manual/${versionId}`);
  redirect(`/admin/manual/${versionId}`);
}
