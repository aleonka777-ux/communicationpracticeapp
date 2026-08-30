import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getManualVersionById, listManualBlocks } from "@/lib/db/manual";
import { parseManualAction } from "@/lib/admin/manualActions";
import { isStageBAllowedTransition } from "@/lib/manual/lifecycle";
import type { ManualLifecycleStatus } from "@/lib/db/types";
import type { ManualValidationReport } from "@/lib/manual/validator";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

function isValidationReport(value: unknown): value is ManualValidationReport {
  return typeof value === "object" && value !== null && "total_blocks" in value;
}

/**
 * "parsed" alone only ever means the Markdown was syntactically parsed and structurally
 * validated — never that its methodology was approved. This derives a finer-grained, UI-only
 * label from the parse report so structural errors are never hidden behind a bare "parsed"
 * badge, without inventing a new manual_versions.status value (see the Stage B task's binding
 * "parsed != validated" rule).
 */
function parseQualityLabel(report: ManualValidationReport | null): { label: string; variant: "success" | "outline" | "primary" } {
  if (!report) return { label: "Not parsed yet", variant: "outline" };
  if (report.has_structural_errors) return { label: "Parsed with structural errors", variant: "outline" };
  if (report.warnings.length > 0) return { label: "Parsed with warnings", variant: "primary" };
  return { label: "Parsed successfully", variant: "success" };
}

export default async function ManualVersionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ duplicate?: string }>;
}) {
  const { id } = await params;
  const { duplicate } = await searchParams;
  const supabase = await createClient();
  const version = await getManualVersionById(supabase, id);
  if (!version) notFound();

  const blocks = version.status === "draft" ? [] : await listManualBlocks(supabase, id);
  const report = isValidationReport(version.parse_report) ? version.parse_report : null;
  const canParse = isStageBAllowedTransition(version.status as ManualLifecycleStatus, "parsed");
  const doc = (version.document_metadata ?? {}) as Record<string, unknown>;

  return (
    <div className="flex flex-col gap-5">
      {duplicate ? (
        <Card className="border-primary/30 bg-primary/5 text-sm text-foreground">
          This exact Manual source was already uploaded — showing the existing version instead of
          creating a duplicate.
        </Card>
      ) : null}

      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">Manual v{version.version_label}</h1>
        <div className="flex items-center gap-2">
          <Badge variant={version.status === "draft" ? "outline" : "primary"}>{version.status}</Badge>
          {version.status !== "draft" ? (
            <Badge variant={parseQualityLabel(report).variant}>{parseQualityLabel(report).label}</Badge>
          ) : null}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Document metadata</CardTitle>
          <CardDescription>Read from the Manual&apos;s own header text, for preview only.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-1 sm:grid-cols-2">
          <p><span className="text-foreground-muted">Source file:</span> {version.source_filename}</p>
          <p><span className="text-foreground-muted">Document status:</span> {String(doc.status ?? "—")}</p>
          <p><span className="text-foreground-muted">Author:</span> {String(doc.author ?? "—")}</p>
          <p><span className="text-foreground-muted">Updated:</span> {String(doc.updated ?? "—")}</p>
          <p><span className="text-foreground-muted">Created:</span> {String(doc.created ?? "—")}</p>
          <p><span className="text-foreground-muted">Uploaded:</span> {new Date(version.created_at).toLocaleString()}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lifecycle</CardTitle>
          <CardDescription>
            This database lifecycle status is separate from the document&apos;s own &quot;Status:&quot;
            text above — &quot;parsed&quot; means the Markdown parsed and was structurally validated,
            not that its methodology has been approved.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <form action={parseManualAction}>
            <input type="hidden" name="id" value={version.id} />
            <Button type="submit" size="sm" disabled={!canParse}>
              Parse Manual
            </Button>
          </form>
          {!canParse ? (
            <p className="text-sm text-foreground-muted">
              Parsing is not available from status &quot;{version.status}&quot; in this stage.
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2 pt-2">
            <Button type="button" size="sm" variant="outline" disabled title="Methodology validation is not implemented yet.">
              Validate
            </Button>
            <Button type="button" size="sm" variant="outline" disabled title="Methodology validation is not implemented yet.">
              Activate
            </Button>
            <Button type="button" size="sm" variant="outline" disabled title="Methodology validation is not implemented yet.">
              Roll back
            </Button>
          </div>
          <p className="text-sm text-foreground-muted">
            Methodology validation is not implemented yet. The Manual requires evaluator validation
            before it can be activated.
          </p>
        </CardContent>
      </Card>

      {report ? (
        <Card>
          <CardHeader>
            <CardTitle>Parse report</CardTitle>
            <CardDescription>Structural / reference validation — not methodology validation.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p>
              <span className="text-foreground-muted">Total blocks:</span> {report.total_blocks} ·{" "}
              <span className="text-foreground-muted">Parser:</span> {report.parser_version}
            </p>
            {report.has_structural_errors ? (
              <div>
                <p className="font-medium text-danger">Errors</p>
                <ul className="list-disc pl-5 text-sm">
                  {report.errors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-sm text-accent-green">No structural errors.</p>
            )}
            {report.warnings.length > 0 ? (
              <div>
                <p className="font-medium text-foreground">Warnings</p>
                <ul className="list-disc pl-5 text-sm">
                  {report.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {report.yaml_errors.length > 0 ? (
              <details>
                <summary className="cursor-pointer text-sm font-medium">
                  YAML fence parse errors ({report.yaml_errors.length})
                </summary>
                <ul className="mt-2 flex flex-col gap-2 text-sm">
                  {report.yaml_errors.map((e, i) => (
                    <li key={i} className="rounded-lg border border-border p-2">
                      <p>
                        Lines {e.lineStart}–{e.lineEnd}
                        {e.heading ? ` (near "${e.heading}")` : ""}
                        {e.candidateBlockId ? ` — candidate id: ${e.candidateBlockId}` : ""}
                      </p>
                      <p className="whitespace-pre-wrap text-foreground-muted">{e.message}</p>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Parsed blocks ({blocks.length})</CardTitle>
          <CardDescription>Original document order. Read-only — block text cannot be edited here.</CardDescription>
        </CardHeader>
        <CardContent>
          {blocks.length === 0 ? (
            <p className="text-sm text-foreground-muted">
              {version.status === "draft" ? "Not parsed yet." : "This version has no parsed blocks."}
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {blocks.map((block) => (
                <details key={block.id} className="rounded-xl border border-border p-3">
                  <summary className="cursor-pointer text-sm font-medium text-foreground">
                    {block.ordinal}. {block.block_id}
                    {block.title ? ` — ${block.title}` : ""}
                    {block.block_type ? ` (${block.block_type})` : ""}
                  </summary>
                  <div className="mt-3 flex flex-col gap-2 text-sm">
                    <p className="text-foreground-muted">
                      Priority: {block.priority ?? "—"} · Section: {block.section_path.join(" › ") || "—"}
                    </p>
                    <details>
                      <summary className="cursor-pointer text-foreground-muted">Metadata</summary>
                      <pre className="mt-1 overflow-x-auto whitespace-pre-wrap rounded-lg bg-surface-muted p-2 text-xs">
                        {JSON.stringify(block.metadata, null, 2)}
                      </pre>
                    </details>
                    <details open={false}>
                      <summary className="cursor-pointer text-foreground-muted">Body</summary>
                      <pre className="mt-1 overflow-x-auto whitespace-pre-wrap rounded-lg bg-surface-muted p-2 text-xs">
                        {block.body_markdown}
                      </pre>
                    </details>
                  </div>
                </details>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
