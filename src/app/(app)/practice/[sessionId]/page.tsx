import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionWithContext } from "@/lib/db/sessions";
import { listMessages } from "@/lib/db/messages";
import { getAIProvider } from "@/lib/ai";
import { isVoiceAvailable } from "@/lib/voice";
import { SimulationClient } from "@/components/practice/simulation-client";

export const dynamic = "force-dynamic";

export default async function PracticeSessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const session = await getSessionWithContext(supabase, sessionId);
  if (!session || session.user_id !== user.id) notFound();

  if (session.status === "completed" || session.status === "evaluating") {
    redirect(`/practice/${sessionId}/feedback`);
  }
  if (session.status === "abandoned") notFound();

  const messages = await listMessages(supabase, sessionId);

  return (
    <SimulationClient
      sessionId={session.id}
      aiLabel={session.scenario.ai_role}
      userObjective={session.scenario.user_objective}
      mode={session.mode}
      startedAtIso={session.started_at}
      durationSeconds={session.selected_duration_seconds}
      initialMessages={messages.map((m) => ({ id: m.id, speaker: m.speaker, text: m.text }))}
      demoMode={getAIProvider().name === "mock"}
      voiceAvailable={isVoiceAvailable()}
    />
  );
}
