import { describe, expect, it } from "vitest";
import { parseAndValidateManual } from "@/lib/manual/parseAndValidate";
import { blockToInsertRow } from "@/lib/manual/validator";

function fence(lang: string, body: string): string {
  return "```" + lang + "\n" + body + "\n```";
}

describe("parseAndValidateManual — safe/idempotent retry behavior", () => {
  const source = [fence("yaml", "id: a\ntype: principle\npriority: high"), "Body A."].join("\n");

  it("produces identical results when run twice on the same source (safe to retry)", () => {
    const first = parseAndValidateManual(source);
    const second = parseAndValidateManual(source);
    expect(second.report).toEqual(first.report);
    expect(second.blockRows).toEqual(first.blockRows);
    expect(second.documentMetadata).toEqual(first.documentMetadata);
  });

  it("does not mark the result fatal for ordinary valid content", () => {
    const result = parseAndValidateManual(source);
    expect(result.report.fatal).toBe(false);
    expect(result.blockRows).toHaveLength(1);
  });

  it("marks the result fatal on a duplicate id, so callers must not persist the block set", () => {
    const dup = [
      fence("yaml", "id: a\ntype: principle\npriority: high"),
      "Body A.",
      "",
      fence("yaml", "id: a\ntype: principle\npriority: low"),
      "Body A again.",
    ].join("\n");
    const result = parseAndValidateManual(dup);
    expect(result.report.fatal).toBe(true);
  });

  it("block rows are ready for insertion (no manual_version_id yet, that is added by the DB layer)", () => {
    const result = parseAndValidateManual(source);
    expect(result.blockRows[0]).not.toHaveProperty("manual_version_id");
    expect(result.blockRows[0]).toEqual(
      blockToInsertRow({
        blockId: "a",
        blockType: "principle",
        title: null,
        priority: "high",
        status: null,
        ordinal: 1,
        sectionPath: [],
        metadata: { id: "a", type: "principle", priority: "high" },
        bodyMarkdown: "Body A.",
        contentHash: result.blockRows[0].content_hash,
        relatedBlockIds: [],
        lineStart: 1,
        lineEnd: 5,
        hasYamlError: false,
      }),
    );
  });
});
