import { describe, expect, it } from "vitest";
import { parseManualMarkdown } from "@/lib/manual/parser";

function fence(lang: string, body: string): string {
  return "```" + lang + "\n" + body + "\n```";
}

describe("Test B — ordinary YAML does not start a new block", () => {
  it("an id-less YAML fence inside a block's body stays body content", () => {
    const source = [
      "# Doc",
      "",
      "## Section A",
      "",
      fence("yaml", "id: blk_a\ntype: principle\npriority: high"),
      "",
      "Intro text.",
      "",
      fence("yaml", "related: [blk_b]"),
      "",
      "More body after ordinary yaml.",
      "",
      "## Section B",
      "",
      fence("yaml", "id: blk_b\ntype: principle\npriority: low"),
      "",
      "Body B.",
    ].join("\n");

    const result = parseManualMarkdown(source);
    expect(result.blocks.map((b) => b.blockId)).toEqual(["blk_a", "blk_b"]);

    const blkA = result.blocks[0];
    expect(blkA.bodyMarkdown).toContain("related: [blk_b]");
    expect(blkA.bodyMarkdown).toContain("More body after ordinary yaml.");
    expect(blkA.bodyMarkdown).not.toContain("Body B.");
  });
});

describe("Test C — nested validation example YAML survives inside its block", () => {
  it("an ex_*-style YAML list and an interior heading do not fragment the enclosing block", () => {
    const source = [
      "## Validation",
      "",
      fence("yaml", "id: val_01\ntype: example\npriority: high"),
      "",
      fence("yaml", "- example_id: ex_001\n  rule_ids: [a, b]\n  fragment: 'hello'"),
      "",
      "### Sub note",
      "",
      "More prose about the example.",
      "",
      fence("yaml", "id: val_02\ntype: example\npriority: high"),
      "",
      "Body 2.",
    ].join("\n");

    const result = parseManualMarkdown(source);
    expect(result.blocks.map((b) => b.blockId)).toEqual(["val_01", "val_02"]);

    const val01 = result.blocks[0];
    expect(val01.bodyMarkdown).toContain("example_id: ex_001");
    expect(val01.bodyMarkdown).toContain("### Sub note");
    expect(val01.bodyMarkdown).toContain("More prose about the example.");
    expect(val01.bodyMarkdown).not.toContain("Body 2.");
  });
});

describe("Test H — malformed YAML produces a useful diagnostic and never silently discards a block", () => {
  it("an id-bearing fence that fails to parse still becomes a flagged block, not a lost one", () => {
    const source = [
      "## Broken",
      "",
      "```yaml",
      "id: broken_01",
      "type: principle",
      "tools: [a, b",
      "```",
      "",
      "## Next",
      "",
      fence("yaml", "id: ok_01\ntype: principle\npriority: high"),
      "",
      "Fine body.",
    ].join("\n");

    const result = parseManualMarkdown(source);

    expect(result.yamlErrors).toHaveLength(1);
    expect(result.yamlErrors[0].candidateBlockId).toBe("broken_01");
    expect(result.yamlErrors[0].lineStart).toBe(3);
    expect(result.yamlErrors[0].lineEnd).toBe(7);
    expect(result.yamlErrors[0].message.length).toBeGreaterThan(0);

    // The block is preserved (flagged), not discarded — and parsing recovers for what follows.
    expect(result.blocks.map((b) => b.blockId)).toEqual(["broken_01", "ok_01"]);
    expect(result.blocks[0].hasYamlError).toBe(true);
    expect(result.blocks[1].hasYamlError).toBe(false);
  });

  it("malformed YAML with no top-level id stays body content and is still reported", () => {
    const source = [
      fence("yaml", "id: host_01\ntype: principle\npriority: high"),
      "",
      "```yaml",
      "merge      # comment breaks this as a single YAML document",
      "separate   # second bare scalar with a comment",
      "```",
      "",
      "Trailing body.",
    ].join("\n");

    const result = parseManualMarkdown(source);
    expect(result.blocks.map((b) => b.blockId)).toEqual(["host_01"]);
    expect(result.yamlErrors).toHaveLength(1);
    expect(result.yamlErrors[0].candidateBlockId).toBeNull();
    expect(result.blocks[0].bodyMarkdown).toContain("Trailing body.");
  });
});

describe("Test I — block body preservation", () => {
  it("tables, quotes, lists and ordinary code fences survive verbatim", () => {
    const bodyLines = [
      "| A | B |",
      "|---|---|",
      "| 1 | 2 |",
      "",
      "> A quoted line.",
      "",
      "- item one",
      "- item two",
      "",
      "```",
      "const x = 1;",
      "```",
    ];
    const source = [fence("yaml", "id: body_01\ntype: principle\npriority: high"), "", ...bodyLines].join("\n");

    const result = parseManualMarkdown(source);
    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0].bodyMarkdown).toBe(bodyLines.join("\n"));
  });
});

describe("document metadata extraction", () => {
  it("reads Version/Status/Author/Created/Updated from the header", () => {
    const source = [
      "# Communication Manual",
      "",
      "**Version:** 9.9.9",
      "**Status:** Draft for review",
      "**Created:** 2020-01-01",
      "**Updated:** 2020-02-02",
      "**Author:** Test Author",
      "",
      fence("yaml", "id: a\ntype: principle\npriority: high"),
      "",
      "Body.",
    ].join("\n");

    const result = parseManualMarkdown(source);
    expect(result.documentMetadata).toEqual({
      versionLabel: "9.9.9",
      status: "Draft for review",
      author: "Test Author",
      created: "2020-01-01",
      updated: "2020-02-02",
    });
  });
});
