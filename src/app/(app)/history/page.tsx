import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { listSessionsForUser } from "@/lib/db/sessions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/state";
import { formatDate, formatDuration } from "@/lib/utils";

export const dynamic = "force-dynamic";

const statusLabel: Record<string, { label: string; variant: "success" | "outline" | "default" }> = {
  completed: { label: "Completed", variant: "success" },
  in_progress: { label: "In progress", variant: "outline" },
  evaluating: { label: "Evaluating", variant: "outline" },
  abandoned: { label: "Abandoned", variant: "default" },
};

export default async function HistoryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const sessions = await listSessionsForUser(supabase, user.id, 100);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold text-foreground">Practice history</h1>
      <p className="mb-6 text-sm text-foreground-muted">Reopen a past attempt to see the transcript, scores, and feedback.</p>

      {sessions.length === 0 ? (
        <EmptyState
          title="No practice sessions yet"
          description="Once you complete a practice session, it will show up here."
          action={
            <Link href="/home" className="text-sm font-medium text-primary">
              Start practising
            </Link>
          }
        />
      ) : (
        <div className="flex flex-col gap-2">
          {sessions.map((session) => {
            const status = statusLabel[session.status] ?? statusLabel.abandoned;
            return (
              <Link key={session.id} href={`/history/${session.id}`} className="block">
                <Card className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{session.scenario.title}</p>
                    <p className="text-sm text-foreground-muted">{session.tool.name}</p>
                    <p className="mt-1 text-xs text-foreground-muted">
                      {formatDate(session.created_at)} · {formatDuration(session.selected_duration_seconds)} ·{" "}
                      {session.mode === "training" ? "Training" : "Realistic"} · Attempt {session.attempt_number}
                    </p>
                  </div>
                  <Badge variant={status.variant}>{status.label}</Badge>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
