import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import { parseManualMarkdown } from "@/lib/manual/parser";
import { validateManualBlocks } from "@/lib/manual/validator";

const MANUAL_PATH = "docs/manual/Communication_Manual_FINAL_v2_1_1_CA_US_Professional_Personal.md";

describe("Test A — the real v2.1.1 Manual parses", () => {
  const source = readFileSync(MANUAL_PATH, "utf8");
  const parsed = parseManualMarkdown(source);
  const report = validateManualBlocks(parsed);
  const ids = parsed.blocks.map((b) => b.blockId);

  it("produces atomic blocks with no thrown error", () => {
    expect(parsed.blocks.length).toBeGreaterThan(0);
  });

  it("every block_id is unique", () => {
    expect(new Set(ids).size).toBe(ids.length);
    expect(report.duplicate_ids).toEqual([]);
  });

  it.each(["manual_decisions", "ret_runtime_contract", "ret_metadata_schema", "ev_04", "sig_00", "val_01", "val_personal_01"])(
    "%s exists",
    (blockId) => {
      expect(ids).toContain(blockId);
    },
  );

  it("extracts the document's own version/status/author/updated header", () => {
    expect(parsed.documentMetadata.versionLabel).toBe("2.1.1");
    expect(parsed.documentMetadata.author).toBe("Elena Muravyeva");
    expect(parsed.documentMetadata.status).toBe("Implementation-ready methodology contract for V1");
  });

  it("has zero unresolved references of any kind", () => {
    expect(report.unresolved_related_ids).toEqual([]);
    expect(report.unresolved_rule_ids).toEqual([]);
    expect(report.unresolved_tools).toEqual([]);
    expect(report.unresolved_signals).toEqual([]);
    expect(report.unresolved_contexts).toEqual([]);
    expect(report.malformed_playbooks).toEqual([]);
    expect(report.stale_block_manual_version_fields).toEqual([]);
    expect(report.bare_context_metadata).toEqual([]);
  });

  it("is not fatal, so this version is eligible for status: parsed", () => {
    expect(report.fatal).toBe(false);
  });
});

/**
 * Test 1 (Stage B cleanup pass) — every ```yaml fence in the finalized v2.1.1 source is now valid
 * YAML, whether or not it is a block-boundary candidate. Fixed by relabeling the ev_04 illustrative
 * fence as ```text and rewriting ex_013's fragment as a block scalar (see the Manual's own v2.1.1
 * changelog entry). This is a v2.1.1-specific fixture assertion, not general parser logic — a
 * future Manual version is free to introduce its own defects, which this test would not catch.
 */
describe("Test 1 — all YAML fences in the current Manual are valid", () => {
  it("yaml_errors is zero", () => {
    const source = readFileSync(MANUAL_PATH, "utf8");
    const report = validateManualBlocks(parseManualMarkdown(source));
    expect(report.yaml_errors).toEqual([]);
  });
});

/** Test 2 (Stage B cleanup pass) — every retrievable block in v2.1.1 now declares a `type`. */
describe("Test 2 — all retrievable blocks have a type", () => {
  it("missing_types is zero", () => {
    const source = readFileSync(MANUAL_PATH, "utf8");
    const report = validateManualBlocks(parseManualMarkdown(source));
    expect(report.missing_types).toEqual([]);
  });
});

const COUNTRY_CONTRAST_BLOCK_IDS = [
  "reg_position",
  "reg_disagreement",
  "reg_ack_before_disagree",
  "reg_request",
  "reg_refusal",
  "reg_credit",
  "reg_apology",
  "reg_small_talk",
  "reg_giving_feedback",
  "reg_receiving_feedback",
  "reg_pause",
  "reg_interruption",
  "reg_questions",
  "reg_empathy",
  "reg_meeting_participation",
  "reg_negotiation",
  "reg_closing",
];

describe("Test 3 — country contrast blocks carry type: cultural_rule", () => {
  const source = readFileSync(MANUAL_PATH, "utf8");
  const parsed = parseManualMarkdown(source);

  it.each(COUNTRY_CONTRAST_BLOCK_IDS)("%s has type cultural_rule", (blockId) => {
    const block = parsed.blocks.find((b) => b.blockId === blockId);
    expect(block?.blockType).toBe("cultural_rule");
  });
});

/**
 * Version-specific fixture assertions for v2.1.1 exactly as it exists today, after the Stage B
 * cleanup pass corrections. These numbers are NOT general parser behavior — a future Manual
 * version may legitimately introduce its own structural issues. Never hardcode these into
 * src/lib/manual/*; they belong only here, pinned to this one fixture file.
 */
describe("v2.1.1 fixture — exact current parse result (not general parser logic)", () => {
  const source = readFileSync(MANUAL_PATH, "utf8");
  const parsed = parseManualMarkdown(source);
  const report = validateManualBlocks(parsed);

  it("currently produces exactly 184 retrievable blocks", () => {
    expect(parsed.blocks.length).toBe(184);
  });

  it("has zero structural errors and zero warnings", () => {
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([]);
    expect(report.has_structural_errors).toBe(false);
  });

  it("val_01's nested example list survives inside its own body, unfragmented", () => {
    const val01 = parsed.blocks.find((b) => b.blockId === "val_01");
    expect(val01?.bodyMarkdown).toContain("example_id: ex_001");
    expect(val01?.bodyMarkdown).toContain("example_id: ex_013");
    // ex_013's fragment survives with its exact wording, now as a valid block scalar.
    expect(val01?.bodyMarkdown).toContain("I didn't do much.");
  });

  it("ev_04's boundary-states example is no longer labelled as a yaml fence", () => {
    const ev04 = parsed.blocks.find((b) => b.blockId === "ev_04");
    expect(ev04?.bodyMarkdown).toContain("```text");
    expect(ev04?.bodyMarkdown).not.toContain("```yaml");
  });

  it("ev_04's section path reflects its actual heading hierarchy", () => {
    const ev04 = parsed.blocks.find((b) => b.blockId === "ev_04");
    expect(ev04?.sectionPath).toEqual(["3. Evidence and Interpretation Rules", "3.4 The semantic response unit"]);
  });
});
