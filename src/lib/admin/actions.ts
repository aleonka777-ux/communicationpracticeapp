"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, isCoach } from "@/lib/db/profiles";
import { createTool, updateTool } from "@/lib/db/tools";
import { createScenario, updateScenario } from "@/lib/db/scenarios";
import { parseCriteria, parseLines, parseOptionalWeights, parseSteps, parseWeights, slugify } from "@/lib/admin/forms";
import type { EmotionalIntensity, Difficulty } from "@/lib/db/types";

async function requireCoach() {
  const supabase = await createClient();
  const profile = await getCurrentProfile(supabase);
  if (!isCoach(profile)) {
    throw new Error("Only coach accounts can manage communication tools and scenarios.");
  }
  return supabase;
}

export async function saveToolAction(formData: FormData): Promise<void> {
  const supabase = await requireCoach();

  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const slugInput = String(formData.get("slug") ?? "").trim();

  const input = {
    name,
    slug: slugify(slugInput || name),
    short_description: String(formData.get("short_description") ?? "").trim(),
    purpose: String(formData.get("purpose") ?? "").trim(),
    when_to_use: String(formData.get("when_to_use") ?? "").trim(),
    core_principles: parseLines(formData, "core_principles"),
    step_by_step_method: parseSteps(formData, "step_by_step_method"),
    good_examples: parseLines(formData, "good_examples"),
    weak_examples: parseLines(formData, "weak_examples"),
    common_mistakes: parseLines(formData, "common_mistakes"),
    evaluation_criteria: parseCriteria(formData, "criteria_"),
    coaching_guidance: String(formData.get("coaching_guidance") ?? "").trim(),
    evaluation_weights: parseWeights(formData, "weight_"),
    active: formData.get("active") === "on",
  };

  if (!input.name) throw new Error("Name is required.");

  if (id) {
    await updateTool(supabase, id, input);
  } else {
    await createTool(supabase, input);
  }

  revalidatePath("/admin/tools");
  revalidatePath("/home");
  redirect("/admin/tools");
}

export async function saveScenarioAction(formData: FormData): Promise<void> {
  const supabase = await requireCoach();

  const id = String(formData.get("id") ?? "").trim();
  const toolId = String(formData.get("tool_id") ?? "").trim();
  if (!toolId) throw new Error("A scenario must belong to a communication tool.");

  const weightsOverride = parseOptionalWeights(formData, "weight_");

  const input = {
    tool_id: toolId,
    title: String(formData.get("title") ?? "").trim(),
    context: String(formData.get("context") ?? "").trim(),
    user_role: String(formData.get("user_role") ?? "").trim(),
    user_objective: String(formData.get("user_objective") ?? "").trim(),
    ai_role: String(formData.get("ai_role") ?? "").trim(),
    relationship: String(formData.get("relationship") ?? "").trim(),
    ai_personality: String(formData.get("ai_personality") ?? "").trim(),
    ai_objective: String(formData.get("ai_objective") ?? "").trim(),
    emotional_intensity: String(formData.get("emotional_intensity") ?? "moderate") as EmotionalIntensity,
    difficulty: String(formData.get("difficulty") ?? "intermediate") as Difficulty,
    opening_line: String(formData.get("opening_line") ?? "").trim(),
    character_behaviours: parseLines(formData, "character_behaviours"),
    escalation_rules: parseLines(formData, "escalation_rules"),
    deescalation_rules: parseLines(formData, "deescalation_rules"),
    scenario_constraints: parseLines(formData, "scenario_constraints"),
    evaluation_overrides: weightsOverride ? { weights: weightsOverride } : {},
    active: formData.get("active") === "on",
  };

  if (!input.title) throw new Error("Title is required.");

  if (id) {
    await updateScenario(supabase, id, input);
  } else {
    await createScenario(supabase, input);
  }

  revalidatePath("/admin/scenarios");
  revalidatePath("/home");
  redirect("/admin/scenarios");
}
