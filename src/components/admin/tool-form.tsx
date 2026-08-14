import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { saveToolAction } from "@/lib/admin/actions";
import { stepsToLines } from "@/lib/admin/forms";
import { EVALUATION_DIMENSIONS, type CommunicationToolRow } from "@/lib/db/types";

const dimensionLabels: Record<string, string> = {
  clarity: "Clarity",
  assertiveness: "Assertiveness",
  acknowledgment: "Acknowledgment",
  non_escalation: "Non-escalation",
  technique: "Target technique",
  effectiveness: "Effectiveness",
};

export function ToolForm({ tool }: { tool?: CommunicationToolRow }) {
  return (
    <form action={saveToolAction} className="flex flex-col gap-5">
      {tool ? <input type="hidden" name="id" value={tool.id} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" name="name" defaultValue={tool?.name} required />
        <Field label="Slug (URL id, leave blank to auto-generate)" name="slug" defaultValue={tool?.slug} />
      </div>

      <TextField label="Short description (shown on the skill list)" name="short_description" defaultValue={tool?.short_description} rows={2} />
      <TextField label="Purpose (what this technique does)" name="purpose" defaultValue={tool?.purpose} rows={2} />
      <TextField label="When to use it" name="when_to_use" defaultValue={tool?.when_to_use} rows={2} />

      <TextField
        label="Core principles (one per line)"
        name="core_principles"
        defaultValue={tool?.core_principles.join("\n")}
        rows={4}
      />
      <TextField
        label="Step-by-step method (one per line, as: Step title: description)"
        name="step_by_step_method"
        defaultValue={tool ? stepsToLines(tool.step_by_step_method) : undefined}
        rows={5}
      />
      <TextField
        label="Good examples (one per line)"
        name="good_examples"
        defaultValue={tool?.good_examples.join("\n")}
        rows={3}
      />
      <TextField
        label="Weak examples (one per line)"
        name="weak_examples"
        defaultValue={tool?.weak_examples.join("\n")}
        rows={3}
      />
      <TextField
        label="Common mistakes (one per line)"
        name="common_mistakes"
        defaultValue={tool?.common_mistakes.join("\n")}
        rows={3}
      />
      <TextField
        label="Coaching guidance (how the AI coach should weigh evidence for this technique)"
        name="coaching_guidance"
        defaultValue={tool?.coaching_guidance}
        rows={3}
      />

      <fieldset className="rounded-2xl border border-border p-4">
        <legend className="px-1 text-sm font-semibold text-foreground">Evaluation criteria per dimension</legend>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          {EVALUATION_DIMENSIONS.map((dim) => (
            <TextField
              key={dim}
              label={dimensionLabels[dim]}
              name={`criteria_${dim}`}
              defaultValue={tool?.evaluation_criteria[dim]}
              rows={2}
            />
          ))}
        </div>
      </fieldset>

      <fieldset className="rounded-2xl border border-border p-4">
        <legend className="px-1 text-sm font-semibold text-foreground">
          Evaluation weights (relative importance; will be normalized to add up to 1.0)
        </legend>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {EVALUATION_DIMENSIONS.map((dim) => (
            <div key={dim} className="flex flex-col gap-1">
              <Label htmlFor={`weight_${dim}`}>{dimensionLabels[dim]}</Label>
              <Input
                id={`weight_${dim}`}
                name={`weight_${dim}`}
                type="number"
                step="0.01"
                min="0"
                max="1"
                defaultValue={tool?.evaluation_weights[dim] ?? 1 / EVALUATION_DIMENSIONS.length}
              />
            </div>
          ))}
        </div>
      </fieldset>

      <label className="flex items-center gap-2 text-sm text-foreground">
        <input type="checkbox" name="active" defaultChecked={tool?.active ?? true} className="h-4 w-4 rounded border-border" />
        Active (visible to users)
      </label>

      <Button type="submit" size="lg" className="w-full sm:w-auto">
        Save communication tool
      </Button>
    </form>
  );
}

function Field({
  label,
  name,
  defaultValue,
  required,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} defaultValue={defaultValue} required={required} />
    </div>
  );
}

function TextField({
  label,
  name,
  defaultValue,
  rows = 3,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  rows?: number;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Textarea id={name} name={name} defaultValue={defaultValue} rows={rows} />
    </div>
  );
}
