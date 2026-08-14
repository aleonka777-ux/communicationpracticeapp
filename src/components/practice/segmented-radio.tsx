import { cn } from "@/lib/utils";

export interface SegmentedOption {
  value: string;
  label: string;
  description?: string;
}

/** Plain radio inputs styled as a segmented control. No client JS required. */
export function SegmentedRadio({
  name,
  options,
  defaultValue,
}: {
  name: string;
  options: SegmentedOption[];
  defaultValue: string;
}) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((option) => (
        <label key={option.value} className="cursor-pointer">
          <input
            type="radio"
            name={name}
            value={option.value}
            defaultChecked={option.value === defaultValue}
            className="peer sr-only"
          />
          <div
            className={cn(
              "flex min-h-16 flex-col items-center justify-center gap-0.5 rounded-xl border border-border px-2 py-2 text-center text-sm text-foreground-muted transition-colors",
              "peer-checked:border-primary peer-checked:bg-primary/10 peer-checked:text-primary peer-checked:font-medium",
              "peer-focus-visible:ring-2 peer-focus-visible:ring-ring",
            )}
          >
            <span>{option.label}</span>
            {option.description ? <span className="text-xs opacity-80">{option.description}</span> : null}
          </div>
        </label>
      ))}
    </div>
  );
}
