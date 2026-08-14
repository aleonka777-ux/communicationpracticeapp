import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireOwnedSession, ApiError } from "@/lib/practice/authorize";
import { listMessages } from "@/lib/db/messages";
import { getToolById } from "@/lib/db/tools";
import { getScenarioById } from "@/lib/db/scenarios";
import { finishConversation, getAttemptsForScenario, markCompleted } from "@/lib/db/sessions";
import { getEvaluationForSession, saveEvaluation } from "@/lib/db/evaluations";
import { selectPreviousAttempt } from "@/lib/practice/attempts";
import { runEvaluation, EvaluationValidationError } from "@/lib/coaching/evaluationEngine";
import { mergeWeights } from "@/lib/coaching/weights";
import { computeScoreDeltas, type DimensionScores } from "@/lib/coaching/comparison";
import { AIProviderError } from "@/lib/ai/types";
import type { EvaluationDimension, EvaluationRow } from "@/lib/db/types";

export const runtime = "nodejs";

const DIMENSION_TO_COLUMN = {
  clarity: "clarity_score",
  assertiveness: "assertiveness_score",
  acknowledgment: "acknowledgment_score",
  non_escalation: "non_escalation_score",
  technique: "technique_score",
  effectiveness: "effectiveness_score",
} as const satisfies Record<EvaluationDimension, keyof EvaluationRow>;

function scoresFromRow(row: EvaluationRow): DimensionScores {
  const scores = {} as DimensionScores;
  (Object.keys(DIMENSION_TO_COLUMN) as EvaluationDimension[]).forEach((dim) => {
    scores[dim] = row[DIMENSION_TO_COLUMN[dim]] as number;
  });
  return scores;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { sessionId?: string };
    const sessionId = body.sessionId?.trim();
    if (!sessionId) throw new ApiError(400, "sessionId is required.");

    const supabase = await createClient();
    const { session } = await requireOwnedSession(supabase, sessionId);

    // Idempotent: if this session was already evaluated (e.g. a retried request), return it.
    const existing = await getEvaluationForSession(supabase, sessionId);
    if (existing) return NextResponse.json({ evaluation: existing });

    if (session.status === "in_progress") {
      await finishConversation(supabase, sessionId);
    } else if (session.status !== "evaluating") {
      throw new ApiError(409, "This session cannot be evaluated in its current state.");
    }

    const [tool, scenario, transcript] = await Promise.all([
      getToolById(supabase, session.tool_id),
      getScenarioById(supabase, session.scenario_id),
      listMessages(supabase, sessionId),
    ]);
    if (!tool || !scenario) throw new ApiError(404, "Scenario configuration not found.");

    const attempts = await getAttemptsForScenario(supabase, session.user_id, session.scenario_id);
    const previousAttemptRef = selectPreviousAttempt(
      attempts.map((a) => ({ id: a.id, attemptNumber: a.attempt_number, status: a.status })),
      session.attempt_number,
    );

    let previous: { evaluation: EvaluationRow; transcript: Awaited<ReturnType<typeof listMessages>> } | undefined;
    if (previousAttemptRef) {
      const [prevEvaluation, prevTranscript] = await Promise.all([
        getEvaluationForSession(supabase, previousAttemptRef.id),
        listMessages(supabase, previousAttemptRef.id),
      ]);
      if (prevEvaluation) previous = { evaluation: prevEvaluation, transcript: prevTranscript };
    }

    const llmOutput = await runEvaluation(tool, {
      scenario,
      transcript,
      hintCount: session.hint_count,
      previous,
    });

    const currentScores: DimensionScores = {
      clarity: llmOutput.dimensions.clarity.score,
      assertiveness: llmOutput.dimensions.assertiveness.score,
      acknowledgment: llmOutput.dimensions.acknowledgment.score,
      non_escalation: llmOutput.dimensions.non_escalation.score,
      technique: llmOutput.dimensions.technique.score,
      effectiveness: llmOutput.dimensions.effectiveness.score,
    };

    const weights = mergeWeights(tool.evaluation_weights, scenario.evaluation_overrides.weights);

    const comparisonData = previous
      ? {
          previous_session_id: previousAttemptRef!.id,
          score_deltas: computeScoreDeltas(currentScores, scoresFromRow(previous.evaluation)),
          qualitative_notes: llmOutput.comparison_notes,
        }
      : null;

    const evaluation = await saveEvaluation(supabase, {
      session_id: sessionId,
      clarity_score: llmOutput.dimensions.clarity.score,
      assertiveness_score: llmOutput.dimensions.assertiveness.score,
      acknowledgment_score: llmOutput.dimensions.acknowledgment.score,
      non_escalation_score: llmOutput.dimensions.non_escalation.score,
      technique_score: llmOutput.dimensions.technique.score,
      effectiveness_score: llmOutput.dimensions.effectiveness.score,
      overall_summary: llmOutput.overall_summary,
      strengths: llmOutput.strengths,
      improvements: llmOutput.improvement_areas,
      next_focus: llmOutput.next_focus,
      structured_evidence: {
        clarity: { evidence: llmOutput.dimensions.clarity.evidence, explanation: llmOutput.dimensions.clarity.explanation },
        assertiveness: { evidence: llmOutput.dimensions.assertiveness.evidence, explanation: llmOutput.dimensions.assertiveness.explanation },
        acknowledgment: { evidence: llmOutput.dimensions.acknowledgment.evidence, explanation: llmOutput.dimensions.acknowledgment.explanation },
        non_escalation: { evidence: llmOutput.dimensions.non_escalation.evidence, explanation: llmOutput.dimensions.non_escalation.explanation },
        technique: { evidence: llmOutput.dimensions.technique.evidence, explanation: llmOutput.dimensions.technique.explanation },
        effectiveness: { evidence: llmOutput.dimensions.effectiveness.evidence, explanation: llmOutput.dimensions.effectiveness.explanation },
      },
      comparison_data: comparisonData,
      evaluator_metadata: { weights, hint_count: session.hint_count },
    });

    await markCompleted(supabase, sessionId);

    return NextResponse.json({ evaluation });
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof EvaluationValidationError) {
      console.error("Evaluation validation failed", error.message);
      return NextResponse.json(
        { error: "We couldn't generate reliable feedback for this attempt. Please try again." },
        { status: 502 },
      );
    }
    if (error instanceof AIProviderError) {
      return NextResponse.json({ error: "Couldn't generate feedback right now. Please try again." }, { status: 502 });
    }
    console.error("practice/end failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
