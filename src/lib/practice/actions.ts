"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getScenarioById } from "@/lib/db/scenarios";
import { createSession, setReadinessRating, deleteSession as deleteSessionRow } from "@/lib/db/sessions";
import { appendMessage } from "@/lib/db/messages";
import { requireOwnedSession } from "@/lib/practice/authorize";
import { revalidatePath } from "next/cache";
import type { DurationSeconds, PracticeMode } from "@/lib/db/types";

const VALID_DURATIONS: DurationSeconds[] = [120, 180, 300];

export async function startPracticeAction(formData: FormData): Promise<void> {
  const scenarioId = String(formData.get("scenarioId") ?? "").trim();
  const modeInput = String(formData.get("mode") ?? "realistic");
  const mode: PracticeMode = modeInput === "training" ? "training" : "realistic";
  const durationInput = Number(formData.get("duration") ?? 180);
  const duration: DurationSeconds = VALID_DURATIONS.includes(durationInput as DurationSeconds)
    ? (durationInput as DurationSeconds)
    : 180;

  if (!scenarioId) throw new Error("Missing scenario.");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const scenario = await getScenarioById(supabase, scenarioId);
  if (!scenario) throw new Error("Scenario not found.");

  const session = await createSession(supabase, {
    userId: user.id,
    scenarioId,
    toolId: scenario.tool_id,
    mode,
    durationSeconds: duration,
  });

  await appendMessage(supabase, session.id, "interlocutor", scenario.opening_line);

  redirect(`/practice/${session.id}`);
}

export async function submitReadinessRatingAction(formData: FormData): Promise<void> {
  const sessionId = String(formData.get("sessionId") ?? "").trim();
  const rating = Number(formData.get("rating") ?? 0);
  if (!sessionId || rating < 1 || rating > 5) return;

  const supabase = await createClient();
  await requireOwnedSession(supabase, sessionId);
  await setReadinessRating(supabase, sessionId, rating);
  revalidatePath(`/practice/${sessionId}/feedback`);
  revalidatePath(`/history/${sessionId}`);
}

export async function deletePracticeSessionAction(formData: FormData): Promise<void> {
  const sessionId = String(formData.get("sessionId") ?? "").trim();
  if (!sessionId) return;

  const supabase = await createClient();
  await requireOwnedSession(supabase, sessionId);
  await deleteSessionRow(supabase, sessionId);
  revalidatePath("/history");
  revalidatePath("/home");
  redirect("/history");
}
