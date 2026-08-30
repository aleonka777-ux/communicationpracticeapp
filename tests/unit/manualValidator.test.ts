import { describe, expect, it } from "vitest";
import { parseManualMarkdown } from "@/lib/manual/parser";
import { validateManualBlocks } from "@/lib/manual/validator";

function fence(lang: string, body: string): string {
  return "```" + lang + "\n" + body + "\n```";
}

function validate(source: string) {
  return validateManualBlocks(parseManualMarkdown(source));
}

describe("Test 4 — malformed nested YAML is a structural error, never a phantom block", () => {
  it("a malformed yaml fence inside an existing block's body does not create a new block", () => {
    const source = [
      fence("yaml", "id: host_01\ntype: example\npriority: high"),
      "",
      fence("yaml", "- example_id: ex_bad\n  fragment: 'it didn't work'"),
      "",
      "Trailing body.",
    ].join("\n");
    const report = validate(source);
    const parsed = parseManualMarkdown(source);

    expect(parsed.blocks.map((b) => b.blockId)).toEqual(["host_01"]);
    expect(report.yaml_errors.length).toBeGreaterThan(0);
    expect(report.has_structural_errors).toBe(true);
    expect(report.errors.some((e) => e.includes("YAML"))).toBe(true);
  });
});

describe("Test 5 — valid non-id YAML is not an error and not a block", () => {
  it("a valid ordinary yaml fence without a top-level id stays in the containing block's body", () => {
    const source = [
      fence("yaml", "id: host_02\ntype: example\npriority: high"),
      "",
      fence("yaml", "- example_id: ex_ok\n  fragment: fine"),
      "",
      "Trailing body.",
    ].join("\n");
    const report = validate(source);
    const parsed = parseManualMarkdown(source);

    expect(parsed.blocks.map((b) => b.blockId)).toEqual(["host_02"]);
    expect(parsed.blocks[0].bodyMarkdown).toContain("example_id: ex_ok");
    expect(report.yaml_errors).toEqual([]);
    expect(report.has_structural_errors).toBe(false);
  });
});

describe("Test 6 — error/warning classification and has_structural_errors", () => {
  it("a genuine YAML defect is always an error, never downgraded to a warning", () => {
    const source = [
      fence("yaml", "id: host_03\ntype: example\npriority: high"),
      "",
      "```yaml",
      "merge      # breaks this as a single YAML document",
      "separate   # second bare scalar",
      "```",
      "",
      "Body.",
    ].join("\n");
    const report = validate(source);
    expect(report.yaml_errors.length).toBe(1);
    expect(report.errors.length).toBeGreaterThan(0);
    expect(report.warnings).toEqual([]);
    expect(report.has_structural_errors).toBe(true);
  });

  it("a warning-only defect does not set has_structural_errors", () => {
    const source = fence("yaml", "id: warn_only\npriority: high") + "\nBody.";
    const report = validate(source);
    expect(report.errors).toEqual([]);
    expect(report.warnings.length).toBeGreaterThan(0);
    expect(report.has_structural_errors).toBe(false);
  });

  it("has_structural_errors is exactly errors.length > 0", () => {
    const clean = fence("yaml", "id: clean_01\ntype: principle\npriority: high") + "\nBody.";
    const report = validate(clean);
    expect(report.errors).toEqual([]);
    expect(report.has_structural_errors).toBe(false);
  });
});

describe("Test D — duplicate block ID produces a deterministic structural diagnostic", () => {
  it("flags a repeated id and marks the report fatal", () => {
    const source = [
      fence("yaml", "id: dup_01\ntype: principle\npriority: high"),
      "First.",
      "",
      fence("yaml", "id: dup_01\ntype: principle\npriority: low"),
      "Second.",
    ].join("\n");

    const report = validate(source);
    expect(report.duplicate_ids).toEqual([{ blockId: "dup_01", count: 2, ordinals: [1, 2] }]);
    expect(report.fatal).toBe(true);
  });
});

describe("Test E — unresolved block reference produces a diagnostic", () => {
  it("flags a related id that resolves to nothing", () => {
    const source = fence("yaml", "id: a\ntype: principle\npriority: high\nrelated: [does_not_exist]") + "\nBody.";
    const report = validate(source);
    expect(report.unresolved_related_ids).toEqual([{ blockId: "a", referencedId: "does_not_exist", field: "related" }]);
    expect(report.fatal).toBe(false);
  });

  it("flags an unresolved rule_ids reference", () => {
    const source = fence("yaml", "id: a\ntype: principle\npriority: high\nrule_ids: [missing_rule]") + "\nBody.";
    const report = validate(source);
    expect(report.unresolved_rule_ids).toEqual([{ blockId: "a", referencedId: "missing_rule", field: "rule_ids" }]);
  });
});

describe("Test F — unresolved tool/signal/context references", () => {
  const source = [
    fence("yaml", "id: tool_real\ntype: tool\ntool_id: tool_real\npriority: high"),
    "Tool body.",
    "",
    fence("yaml", "id: sig_real\ntype: signal\nsignal_id: sig_real\npriority: high"),
    "Signal body.",
    "",
    fence("yaml", "id: ctx_real\ntype: context\ncontext_id: ctx_real\npriority: high"),
    "Context body.",
    "",
    fence(
      "yaml",
      "id: uses_refs\ntype: playbook\npriority: high\ntools: [tool_real, tool_fake]\nsignals: [sig_real, sig_fake]\ncontext_type: ctx_fake\ncontexts: [ctx_real, ctx_fake]",
    ),
    "Uses refs body.",
  ].join("\n");
  const report = validate(source);

  it("only flags the tool reference that does not resolve", () => {
    expect(report.unresolved_tools).toEqual([{ blockId: "uses_refs", referencedId: "tool_fake", field: "tools" }]);
  });

  it("only flags the signal reference that does not resolve", () => {
    expect(report.unresolved_signals).toEqual([{ blockId: "uses_refs", referencedId: "sig_fake", field: "signals" }]);
  });

  it("flags both the context_type and contexts entries that do not resolve", () => {
    expect(report.unresolved_contexts).toEqual([
      { blockId: "uses_refs", referencedId: "ctx_fake", field: "context_type" },
      { blockId: "uses_refs", referencedId: "ctx_fake", field: "contexts" },
    ]);
  });

  it("that same playbook is not reported as malformed once tools/context_type resolve structurally", () => {
    expect(report.malformed_playbooks).toEqual([]);
  });
});

describe("Test G — context_type: any is accepted as the validation wildcard", () => {
  it("does not report 'any' as an unresolved context", () => {
    const source = fence("yaml", "id: ex_any\ntype: example\npriority: high\ncontext_type: any") + "\nBody.";
    const report = validate(source);
    expect(report.unresolved_contexts).toEqual([]);
  });
});

describe("metadata contract diagnostics", () => {
  it("flags a block missing a type field", () => {
    const source = fence("yaml", "id: no_type\npriority: high") + "\nBody.";
    const report = validate(source);
    expect(report.missing_types).toEqual([{ blockId: "no_type", line: 1, heading: null }]);
  });

  it("does not invent a type from the id prefix for a block missing one", () => {
    const source = fence("yaml", "id: reg_fake_contrast\npriority: high") + "\nBody.";
    const parsed = parseManualMarkdown(source);
    expect(parsed.blocks[0].blockType).toBeNull();
  });

  it("flags a stale block-level manual_version field", () => {
    const source = fence("yaml", "id: stale_01\ntype: principle\npriority: high\nmanual_version: 2.0") + "\nBody.";
    const report = validate(source);
    expect(report.stale_block_manual_version_fields).toEqual([{ blockId: "stale_01", line: 1 }]);
  });

  it("flags a bare 'context' field instead of context_type/contexts", () => {
    const source = fence("yaml", "id: bare_ctx\ntype: playbook\npriority: high\ncontext: disagreement") + "\nBody.";
    const report = validate(source);
    expect(report.bare_context_metadata).toEqual([{ blockId: "bare_ctx", line: 1 }]);
  });

  it("flags a malformed playbook missing context_type/tools", () => {
    const source = fence("yaml", "id: pb_broken\ntype: playbook\npriority: high") + "\nBody.";
    const report = validate(source);
    expect(report.malformed_playbooks).toEqual([
      { blockId: "pb_broken", reason: "missing context_type; missing or non-array tools" },
    ]);
  });
});
