import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getScenarioById } from "@/lib/db/scenarios";
import { listTools } from "@/lib/db/tools";
import { ScenarioForm } from "@/components/admin/scenario-form";

export const dynamic = "force-dynamic";

export default async function EditScenarioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [scenario, tools] = await Promise.all([getScenarioById(supabase, id), listTools(supabase)]);
  if (!scenario) notFound();

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold text-foreground">Edit {scenario.title}</h1>
      <ScenarioForm scenario={scenario} tools={tools} />
    </div>
  );
}
