import { createClient } from "@/lib/supabase/server";
import { listTools } from "@/lib/db/tools";
import { ScenarioForm } from "@/components/admin/scenario-form";

export const dynamic = "force-dynamic";

export default async function NewScenarioPage() {
  const supabase = await createClient();
  const tools = await listTools(supabase);

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold text-foreground">New scenario</h1>
      <ScenarioForm tools={tools} />
    </div>
  );
}
