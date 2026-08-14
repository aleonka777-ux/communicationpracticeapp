import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { saveScenarioAction } from "@/lib/admin/actions";
import { EVALUATION_DIMENSIONS, type CommunicationToolRow, type ScenarioRow } from "@/lib/db/types";

const dimensionLabels: Record<string, string> = {
  clarity: "Clarity",
  assertiveness: "Assertiveness",
  acknowledgment: "Acknowledgment",
  non_escalation: "Non-escalation",
  technique: "Target technique",
  effectiveness: "Effectiveness",
};

export function ScenarioForm({ scenario, tools }: { scenario?: ScenarioRow; tools: CommunicationToolRow[] }) {
  const overrideWeights = scenario?.evaluation_overrides.weights ?? {};

  return (
    <form action={saveScenarioAction} className="flex flex-col gap-5">
      {scenario ? <input type="hidden" name="id" value={scenario.id} /> : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="tool_id">Communication tool</Label>
        <Select id="tool_id" name="tool_id" defaultValue={scenario?.tool_id} required>
          <option value="" disabled>
            Select a tool…
          </option>
          {tools.map((tool) => (
            <option key={tool.id} value={tool.id}>
              {tool.name}
            </option>
          ))}
        </Select>
      </div>

      <Field label="Title" name="title" defaultValue={scenario?.title} required />
      <TextField label="Context (what's happening)" name="context" defaultValue={scenario?.context} rows={2} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="User's role" name="user_role" defaultValue={scenario?.user_role} />
        <Field label="AI character's role" name="ai_role" defaultValue={scenario?.ai_role} />
      </div>
      <TextField label="User's objective" name="user_objective" defaultValue={scenario?.user_objective} rows={2} />
      <Field label="Relationship" name="relationship" defaultValue={scenario?.relationship} />
      <TextField label="AI personality" name="ai_personality" defaultValue={scenario?.ai_personality} rows={2} />
      <TextField label="AI character's objective" name="ai_objective" defaultValue={scenario?.ai_objective} rows={2} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="emotional_intensity">Emotional intensity</Label>
          <Select id="emotional_intensity" name="emotional_intensity" defaultValue={scenario?.emotional_intensity ?? "moderate"}>
            <option value="low">Low</option>
            <option value="moderate">Moderate</option>
            <option value="high">High</option>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="difficulty">Difficulty</Label>
          <Select id="difficulty" name="difficulty" defaultValue={scenario?.difficulty ?? "intermediate"}>
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </Select>
        </div>
      </div>

      <TextField label="Opening line (what the AI character says first)" name="opening_line" defaultValue={scenario?.opening_line} rows={2} />
      <TextField
        label="Character behaviours (one per line)"
        name="character_behaviours"
        defaultValue={scenario?.character_behaviours.join("\n")}
        rows={3}
      />
      <TextField
        label="Escalation rules — when the character becomes more resistant (one per line)"
        name="escalation_rules"
        defaultValue={scenario?.escalation_rules.join("\n")}
        rows={3}
      />
      <TextField
        label="De-escalation rules — when the character becomes more cooperative (one per line)"
        name="deescalation_rules"
        defaultValue={scenario?.deescalation_rules.join("\n")}
        rows={3}
      />
      <TextField
        label="Scenario constraints / safety limits (one per line)"
        name="scenario_constraints"
        defaultValue={scenario?.scenario_constraints.join("\n")}
        rows={2}
      />

      <fieldset className="rounded-2xl border border-border p-4">
        <legend className="px-1 text-sm font-semibold text-foreground">
          Evaluation weight overrides (optional — leave blank to use the tool&rsquo;s defaults)
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
                defaultValue={overrideWeights[dim as keyof typeof overrideWeights]}
                placeholder="—"
              />
            </div>
          ))}
        </div>
      </fieldset>

      <label className="flex items-center gap-2 text-sm text-foreground">
        <input type="checkbox" name="active" defaultChecked={scenario?.active ?? true} className="h-4 w-4 rounded border-border" />
        Active (visible to users)
      </label>

      <Button type="submit" size="lg" className="w-full sm:w-auto">
        Save scenario
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
