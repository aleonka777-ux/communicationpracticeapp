import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionWithContext, getAttemptsForScenario } from "@/lib/db/sessions";
import { getEvaluationForSession } from "@/lib/db/evaluations";
import { FeedbackView } from "@/components/feedback/feedback-view";
import { EvaluationPending } from "@/components/feedback/evaluation-pending";

export const dynamic = "force-dynamic";

export default async function FeedbackPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Independent reads — run concurrently rather than sequentially. By the time this page is
  // reached, /api/practice/end has already persisted both rows (see /docs/DECISIONS.md
  // "Navigation-latency fix: parallelize destination-route reads"), so neither result depends on
  // the other; there is no reason to pay for two sequential round trips here.
  const [session, evaluation] = await Promise.all([
    getSessionWithContext(supabase, sessionId),
    getEvaluationForSession(supabase, sessionId),
  ]);
  if (!session || session.user_id !== user.id) notFound();

  if (session.status === "in_progress") redirect(`/practice/${sessionId}`);

  if (!evaluation) {
    return <EvaluationPending sessionId={sessionId} />;
  }

  const attempts = await getAttemptsForScenario(supabase, user.id, session.scenario_id);
  const completedBeforeOrAt = attempts.filter(
    (a) => a.status === "completed" && a.attempt_number <= session.attempt_number,
  ).length;

  return (
    <FeedbackView
      evaluation={evaluation}
      scenario={session.scenario}
      toolName={session.tool.name}
      attemptNumber={completedBeforeOrAt || session.attempt_number}
      readinessRating={session.readiness_rating}
    />
  );
}
