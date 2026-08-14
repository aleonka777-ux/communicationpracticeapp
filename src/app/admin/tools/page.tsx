import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { listTools } from "@/lib/db/tools";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/state";

export const dynamic = "force-dynamic";

export default async function AdminToolsPage() {
  const supabase = await createClient();
  const tools = await listTools(supabase);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">Communication tools</h1>
        <Link href="/admin/tools/new">
          <Button size="sm">
            <Plus className="h-4 w-4" /> New tool
          </Button>
        </Link>
      </div>

      {tools.length === 0 ? (
        <EmptyState title="No tools yet" description="Create your first communication tool to get started." />
      ) : (
        <div className="flex flex-col gap-2">
          {tools.map((tool) => (
            <Link key={tool.id} href={`/admin/tools/${tool.id}`} className="block">
              <Card className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-foreground">{tool.name}</p>
                  <p className="text-sm text-foreground-muted">{tool.short_description}</p>
                </div>
                <Badge variant={tool.active ? "success" : "outline"}>{tool.active ? "Active" : "Inactive"}</Badge>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
