import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { listManualVersions } from "@/lib/db/manual";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/state";
import type { ManualLifecycleStatus } from "@/lib/db/types";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<ManualLifecycleStatus, "default" | "primary" | "success" | "outline"> = {
  draft: "outline",
  parsed: "primary",
  validated: "success",
  active: "success",
  archived: "default",
};

export default async function AdminManualPage() {
  const supabase = await createClient();
  const versions = await listManualVersions(supabase);

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">Communication Manual</h1>
        <Link href="/admin/manual/new">
          <Button size="sm">
            <Plus className="h-4 w-4" /> Upload version
          </Button>
        </Link>
      </div>
      <p className="mb-4 text-sm text-foreground-muted">
        Upload, parse, and preview versioned Manual sources. This is methodology source material —
        it is not yet connected to evaluation.
      </p>

      {versions.length === 0 ? (
        <EmptyState
          title="No Manual versions yet"
          description="Upload a Manual Markdown source to get started."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {versions.map((version) => (
            <Link key={version.id} href={`/admin/manual/${version.id}`} className="block">
              <Card className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-foreground">
                    v{version.version_label}
                    <span className="ml-2 text-sm font-normal text-foreground-muted">{version.source_filename}</span>
                  </p>
                  <p className="text-sm text-foreground-muted">
                    {version.block_count} block{version.block_count === 1 ? "" : "s"}
                    {version.parser_version ? ` · ${version.parser_version}` : ""} · uploaded{" "}
                    {new Date(version.created_at).toLocaleDateString()}
                    {version.parsed_at ? ` · parsed ${new Date(version.parsed_at).toLocaleDateString()}` : ""}
                  </p>
                </div>
                <Badge variant={STATUS_BADGE[version.status]}>{version.status}</Badge>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
