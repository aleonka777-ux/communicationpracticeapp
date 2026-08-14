import { formatDuration } from "@/lib/utils";
import { cn } from "@/lib/utils";

export function TimerBadge({ remainingSeconds, urgent }: { remainingSeconds: number; urgent: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium tabular-nums",
        urgent ? "bg-danger/10 text-danger" : "bg-surface-muted text-foreground-muted",
      )}
      aria-label={`${formatDuration(remainingSeconds)} remaining`}
    >
      {formatDuration(remainingSeconds)}
    </span>
  );
}
