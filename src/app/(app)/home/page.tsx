import { createClient } from "@/lib/supabase/server";
import { listTools } from "@/lib/db/tools";
import { listSessionsForUser } from "@/lib/db/sessions";
import { ToolCard } from "@/components/practice/tool-card";
import { ContinuePractising } from "@/components/practice/continue-practicing";
import { EmptyState } from "@/components/ui/state";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [tools, sessions] = await Promise.all([
    listTools(supabase),
    user ? listSessionsForUser(supabase, user.id, 50) : Promise.resolve([]),
  ]);

  const activeTools = tools.filter((tool) => tool.active);
  const recentCompleted = sessions.filter((s) => s.status === "completed").slice(0, 3);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold text-foreground">What do you want to practise today?</h1>
      <p className="mb-6 text-sm text-foreground-muted">Choose a skill, then a scenario, and step into the conversation.</p>

      <ContinuePractising sessions={recentCompleted} />

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-foreground-muted">
          Communication skills
        </h2>
        {activeTools.length === 0 ? (
          <EmptyState
            title="No skills available yet"
            description="Ask your coach to add communication tools in the admin area."
          />
        ) : (
          <div className="flex flex-col gap-2">
            {activeTools.map((tool) => (
              <ToolCard key={tool.id} tool={tool} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
