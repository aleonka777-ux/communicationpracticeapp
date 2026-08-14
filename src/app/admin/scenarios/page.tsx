import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { listAllScenarios } from "@/lib/db/scenarios";
import { listTools } from "@/lib/db/tools";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/state";

export const dynamic = "force-dynamic";

export default async function AdminScenariosPage() {
  const supabase = await createClient();
  const [scenarios, tools] = await Promise.all([listAllScenarios(supabase), listTools(supabase)]);
  const toolNameById = new Map(tools.map((t) => [t.id, t.name]));

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">Scenarios</h1>
        <Link href="/admin/scenarios/new">
          <Button size="sm">
            <Plus className="h-4 w-4" /> New scenario
          </Button>
        </Link>
      </div>

      {scenarios.length === 0 ? (
        <EmptyState title="No scenarios yet" description="Create your first scenario to get started." />
      ) : (
        <div className="flex flex-col gap-2">
          {scenarios.map((scenario) => (
            <Link key={scenario.id} href={`/admin/scenarios/${scenario.id}`} className="block">
              <Card className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-foreground">{scenario.title}</p>
                  <p className="text-sm text-foreground-muted">{toolNameById.get(scenario.tool_id) ?? "Unknown tool"}</p>
                </div>
                <Badge variant={scenario.active ? "success" : "outline"}>{scenario.active ? "Active" : "Inactive"}</Badge>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
