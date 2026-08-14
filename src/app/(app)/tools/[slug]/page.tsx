import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getToolBySlug } from "@/lib/db/tools";
import { listScenariosForTool } from "@/lib/db/scenarios";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TechniqueExplainer } from "@/components/practice/technique-explainer";
import { EmptyState } from "@/components/ui/state";

export const dynamic = "force-dynamic";

const intensityLabel: Record<string, string> = { low: "Low intensity", moderate: "Moderate intensity", high: "High intensity" };

export default async function ToolDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const tool = await getToolBySlug(supabase, slug);
  if (!tool || !tool.active) notFound();

  const scenarios = (await listScenariosForTool(supabase, tool.id)).filter((s) => s.active);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-foreground">{tool.name}</h1>
      <p className="mt-1 text-sm text-foreground-muted">{tool.when_to_use}</p>

      <div className="mt-4">
        <TechniqueExplainer tool={tool} />
      </div>

      <h2 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wide text-foreground-muted">Scenarios</h2>
      {scenarios.length === 0 ? (
        <EmptyState title="No scenarios yet" description="Your coach hasn't added scenarios for this skill yet." />
      ) : (
        <div className="flex flex-col gap-2">
          {scenarios.map((scenario) => (
            <Link key={scenario.id} href={`/practice/setup/${scenario.id}`} className="block">
              <Card className="transition-colors hover:border-primary/40">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-foreground">{scenario.title}</p>
                    <p className="mt-0.5 text-sm text-foreground-muted">{scenario.context}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Badge>{scenario.difficulty}</Badge>
                      <Badge variant="outline">{intensityLabel[scenario.emotional_intensity]}</Badge>
                    </div>
                  </div>
                  <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-foreground-muted" aria-hidden="true" />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
