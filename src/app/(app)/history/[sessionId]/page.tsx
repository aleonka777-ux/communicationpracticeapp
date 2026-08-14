import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionWithContext, getAttemptsForScenario } from "@/lib/db/sessions";
import { getEvaluationForSession } from "@/lib/db/evaluations";
import { listMessages } from "@/lib/db/messages";
import { FeedbackView } from "@/components/feedback/feedback-view";
import { TranscriptCard } from "@/components/practice/transcript-card";
import { DeleteSessionButton } from "@/components/practice/delete-session-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function HistorySessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const session = await getSessionWithContext(supabase, sessionId);
  if (!session || session.user_id !== user.id) notFound();

  const [evaluation, messages] = await Promise.all([
    getEvaluationForSession(supabase, sessionId),
    listMessages(supabase, sessionId),
  ]);

  const transcriptMessages = messages.map((m) => ({ id: m.id, speaker: m.speaker, text: m.text }));

  if (evaluation) {
    const attempts = await getAttemptsForScenario(supabase, user.id, session.scenario_id);
    const attemptOrdinal = attempts.filter(
      (a) => a.status === "completed" && a.attempt_number <= session.attempt_number,
    ).length;

    return (
      <div className="flex flex-col gap-4">
        <TranscriptCard messages={transcriptMessages} aiLabel={session.scenario.ai_role} />
        <FeedbackView
          evaluation={evaluation}
          scenario={session.scenario}
          toolName={session.tool.name}
          attemptNumber={attemptOrdinal || session.attempt_number}
          readinessRating={session.readiness_rating}
        />
        <DeleteSessionButton sessionId={session.id} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">{session.tool.name}</p>
        <h1 className="mt-1 text-2xl font-semibold text-foreground">{session.scenario.title}</h1>
        <p className="mt-1 text-sm text-foreground-muted">{formatDateTime(session.created_at)}</p>
        <div className="mt-2">
          <Badge>{session.status === "in_progress" ? "In progress" : "Abandoned"}</Badge>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>This session wasn&rsquo;t completed</CardTitle>
        </CardHeader>
        <CardContent>
          {session.status === "in_progress"
            ? "You can pick this conversation back up where you left off."
            : "This attempt ended before feedback could be generated."}
        </CardContent>
      </Card>

      {transcriptMessages.length > 0 ? <TranscriptCard messages={transcriptMessages} aiLabel={session.scenario.ai_role} /> : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        {session.status === "in_progress" ? (
          <Link href={`/practice/${session.id}`} className="flex-1">
            <Button size="lg" className="w-full">
              Continue practice
            </Button>
          </Link>
        ) : (
          <Link href={`/practice/setup/${session.scenario.id}`} className="flex-1">
            <Button size="lg" className="w-full">
              Practice this again
            </Button>
          </Link>
        )}
        <DeleteSessionButton sessionId={session.id} />
      </div>
    </div>
  );
}
