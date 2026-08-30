import { parseManualMarkdown, type ManualDocumentMetadata } from "@/lib/manual/parser";
import { validateManualBlocks, blockToInsertRow, type ManualValidationReport } from "@/lib/manual/validator";
import { MANUAL_PARSER_VERSION } from "@/lib/manual/parser";

export interface ManualParseAndValidateResult {
  parserVersion: string;
  documentMetadata: ManualDocumentMetadata;
  report: ManualValidationReport;
  blockRows: ReturnType<typeof blockToInsertRow>[];
}

/**
 * Parses Markdown source fully in memory and structurally validates it before
 * anything is persisted. Callers must only replace a version's stored block
 * set when `report.fatal` is false — this keeps re-parsing safe/idempotent:
 * a failed attempt never leaves a half-written block set behind because
 * nothing is written until parsing + validation both complete in memory.
 */
export function parseAndValidateManual(source: string): ManualParseAndValidateResult {
  const parseResult = parseManualMarkdown(source);
  const report = validateManualBlocks(parseResult);
  const blockRows = parseResult.blocks.map(blockToInsertRow);

  return {
    parserVersion: MANUAL_PARSER_VERSION,
    documentMetadata: parseResult.documentMetadata,
    report,
    blockRows,
  };
}
