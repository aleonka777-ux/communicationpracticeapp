import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { submitReadinessRatingAction } from "@/lib/practice/actions";

const LABELS = ["Not at all", "A little", "Somewhat", "Mostly", "Very"];

export function ReadinessForm({ sessionId, existingRating }: { sessionId: string; existingRating: number | null }) {
  if (existingRating) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>How prepared do you feel?</CardTitle>
        </CardHeader>
        <p className="text-sm text-foreground-muted">
          You rated your readiness for a similar real conversation: <span className="font-medium text-foreground">{existingRating}/5 — {LABELS[existingRating - 1]}</span>.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>How prepared do you feel?</CardTitle>
        <p className="text-sm text-foreground-muted">
          How ready do you feel to handle a similar conversation in real life? This is separate from the scores above.
        </p>
      </CardHeader>
      <form action={submitReadinessRatingAction} className="flex flex-col gap-3">
        <input type="hidden" name="sessionId" value={sessionId} />
        <div className="grid grid-cols-5 gap-1.5">
          {[1, 2, 3, 4, 5].map((value) => (
            <label key={value} className="cursor-pointer">
              <input type="radio" name="rating" value={value} className="peer sr-only" required />
              <div className="flex h-14 flex-col items-center justify-center gap-0.5 rounded-xl border border-border text-center text-xs text-foreground-muted peer-checked:border-primary peer-checked:bg-primary/10 peer-checked:text-primary peer-checked:font-medium peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
                <span className="text-sm font-semibold">{value}</span>
              </div>
            </label>
          ))}
        </div>
        <Button type="submit" variant="outline" size="sm" className="w-full sm:w-auto">
          Save
        </Button>
      </form>
    </Card>
  );
}
