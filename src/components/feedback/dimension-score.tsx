import { cn } from "@/lib/utils";

const dimensionLabels: Record<string, string> = {
  clarity: "Clarity",
  assertiveness: "Assertiveness",
  acknowledgment: "Acknowledgment",
  non_escalation: "Non-escalation",
  technique: "Target technique",
  effectiveness: "Effectiveness",
};

export function DimensionScoreRow({
  dimension,
  score,
  evidence,
  explanation,
  delta,
}: {
  dimension: string;
  score: number;
  evidence?: string;
  explanation?: string;
  delta?: number;
}) {
  return (
    <div className="flex flex-col gap-1 border-b border-border py-3 last:border-b-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-foreground">{dimensionLabels[dimension] ?? dimension}</span>
        <div className="flex items-center gap-2">
          {typeof delta === "number" && delta !== 0 ? (
            <span className={cn("text-xs font-medium", delta > 0 ? "text-accent-green" : "text-danger")}>
              {delta > 0 ? `+${delta}` : delta}
            </span>
          ) : null}
          <ScoreDots score={score} />
        </div>
      </div>
      {explanation ? <p className="text-sm text-foreground-muted">{explanation}</p> : null}
      {evidence ? <p className="text-xs italic text-foreground-muted">&ldquo;{evidence}&rdquo;</p> : null}
    </div>
  );
}

export function ScoreDots({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-1" aria-label={`${score} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className={cn("h-2 w-2 rounded-full", i <= score ? "bg-primary" : "bg-surface-muted")}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}
