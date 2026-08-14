import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DimensionScoreRow } from "@/components/feedback/dimension-score";
import { ReadinessForm } from "@/components/feedback/readiness-form";
import { EVALUATION_DIMENSIONS, type EvaluationDimension, type EvaluationRow, type ScenarioRow } from "@/lib/db/types";

const scoreColumn: Record<EvaluationDimension, keyof EvaluationRow> = {
  clarity: "clarity_score",
  assertiveness: "assertiveness_score",
  acknowledgment: "acknowledgment_score",
  non_escalation: "non_escalation_score",
  technique: "technique_score",
  effectiveness: "effectiveness_score",
};

export function FeedbackView({
  evaluation,
  scenario,
  toolName,
  attemptNumber,
  readinessRating,
}: {
  evaluation: EvaluationRow;
  scenario: ScenarioRow;
  toolName: string;
  attemptNumber: number;
  readinessRating: number | null;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">{toolName}</p>
        <h1 className="mt-1 text-2xl font-semibold text-foreground">Practice complete. Let&rsquo;s look at what happened.</h1>
        <div className="mt-2 flex items-center gap-2">
          <Badge variant="outline">{scenario.title}</Badge>
          <Badge>Attempt {attemptNumber}</Badge>
        </div>
      </div>

      <Card>
        <CardContent>{evaluation.overall_summary}</CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Practice indicators</CardTitle>
          <p className="text-sm text-foreground-muted">Evidence-based indicators, not a measurement of you as a person.</p>
        </CardHeader>
        <CardContent>
          {EVALUATION_DIMENSIONS.map((dim) => (
            <DimensionScoreRow
              key={dim}
              dimension={dim}
              score={evaluation[scoreColumn[dim]] as number}
              evidence={evaluation.structured_evidence[dim]?.evidence}
              explanation={evaluation.structured_evidence[dim]?.explanation}
              delta={evaluation.comparison_data?.score_deltas[dim]}
            />
          ))}
        </CardContent>
      </Card>

      {evaluation.comparison_data && evaluation.comparison_data.qualitative_notes.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Compared to your last attempt</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-inside list-disc space-y-1">
              {evaluation.comparison_data.qualitative_notes.map((note, i) => (
                <li key={i}>{note}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>What worked</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-3">
            {evaluation.strengths.map((s, i) => (
              <li key={i}>
                <p className="text-foreground">{s.point}</p>
                {s.evidence ? <p className="text-xs italic text-foreground-muted">&ldquo;{s.evidence}&rdquo;</p> : null}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What could be better</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-4">
            {evaluation.improvements.map((imp, i) => (
              <li key={i} className="flex flex-col gap-1">
                <p className="font-medium text-foreground">{imp.issue}</p>
                <p className="text-foreground-muted">{imp.why_it_matters}</p>
                <p className="text-foreground-muted">
                  <span className="font-medium text-foreground">Try instead: </span>
                  {imp.suggestion}
                </p>
                {imp.example ? <p className="text-xs italic text-foreground-muted">&ldquo;{imp.example}&rdquo;</p> : null}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card className="border-primary/30 bg-primary/5">
        <CardHeader>
          <CardTitle>Next practice focus</CardTitle>
        </CardHeader>
        <CardContent>{evaluation.next_focus}</CardContent>
      </Card>

      <ReadinessForm sessionId={evaluation.session_id} existingRating={readinessRating} />

      <div className="flex flex-col gap-2 pb-4 sm:flex-row">
        <Link href={`/practice/setup/${scenario.id}`} className="flex-1">
          <Button size="lg" className="w-full">
            Try again
          </Button>
        </Link>
        <Link href="/home" className="flex-1">
          <Button size="lg" variant="outline" className="w-full">
            Choose another skill
          </Button>
        </Link>
      </div>
    </div>
  );
}
