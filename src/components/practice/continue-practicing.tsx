import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { SessionListItem } from "@/lib/db/sessions";

export function ContinuePractising({ sessions }: { sessions: SessionListItem[] }) {
  if (sessions.length === 0) return null;

  return (
    <section className="mb-6">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-foreground-muted">
        Continue practising
      </h2>
      <div className="flex flex-col gap-2">
        {sessions.map((session) => (
          <Link key={session.id} href={`/practice/setup/${session.scenario.id}`} className="block">
            <Card className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">{session.scenario.title}</p>
                <p className="text-sm text-foreground-muted">{session.tool.name}</p>
              </div>
              <Badge variant="outline">Attempt {session.attempt_number + 1}</Badge>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}
