import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getScenarioById } from "@/lib/db/scenarios";
import { getToolById } from "@/lib/db/tools";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TechniqueExplainer } from "@/components/practice/technique-explainer";
import { SegmentedRadio } from "@/components/practice/segmented-radio";
import { startPracticeAction } from "@/lib/practice/actions";

export const dynamic = "force-dynamic";

const intensityLabel: Record<string, string> = { low: "Low intensity", moderate: "Moderate intensity", high: "High intensity" };

export default async function PracticeSetupPage({ params }: { params: Promise<{ scenarioId: string }> }) {
  const { scenarioId } = await params;
  const supabase = await createClient();
  const scenario = await getScenarioById(supabase, scenarioId);
  if (!scenario || !scenario.active) notFound();

  const tool = await getToolById(supabase, scenario.tool_id);
  if (!tool) notFound();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">{tool.name}</p>
        <h1 className="mt-1 text-2xl font-semibold text-foreground">{scenario.title}</h1>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Badge>{scenario.difficulty}</Badge>
          <Badge variant="outline">{intensityLabel[scenario.emotional_intensity]}</Badge>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Scenario</CardTitle>
        </CardHeader>
        <CardContent>{scenario.context}</CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Your role</CardTitle>
          </CardHeader>
          <CardContent>{scenario.user_role}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Your objective</CardTitle>
          </CardHeader>
          <CardContent>{scenario.user_objective}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Who you&rsquo;ll be talking to</CardTitle>
          <p className="text-sm text-foreground-muted">{scenario.relationship}</p>
        </CardHeader>
        <CardContent>{scenario.ai_role} — {scenario.ai_personality}</CardContent>
      </Card>

      <TechniqueExplainer tool={tool} />

      <form action={startPracticeAction} className="flex flex-col gap-5">
        <input type="hidden" name="scenarioId" value={scenario.id} />

        <div>
          <p className="mb-2 text-sm font-semibold text-foreground">Practice mode</p>
          <SegmentedRadio
            name="mode"
            defaultValue="realistic"
            options={[
              { value: "realistic", label: "Realistic", description: "No hints, no help" },
              { value: "training", label: "Training", description: "Hints available" },
            ]}
          />
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold text-foreground">Duration</p>
          <SegmentedRadio
            name="duration"
            defaultValue="180"
            options={[
              { value: "120", label: "2 min" },
              { value: "180", label: "3 min" },
              { value: "300", label: "5 min" },
            ]}
          />
        </div>

        <Button type="submit" size="lg" className="w-full">
          Start practice
        </Button>
      </form>
    </div>
  );
}
