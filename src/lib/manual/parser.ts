import * as yaml from "js-yaml";
import { createHash } from "crypto";

/**
 * Deterministic Markdown/YAML parser for versioned Communication Manuals.
 *
 * Contract (see /docs/manual and CLAUDE.md "Stage B" scope):
 * - A retrievable block begins at a fenced ```yaml block whose parsed top-level
 *   mapping contains a string `id` field.
 * - A block ends immediately before the next id-bearing YAML fence, or at
 *   end-of-document. Any other YAML/code fence, heading, table or example
 *   encountered inside that span is body content, never a new boundary.
 * - Headings are tracked only outside fences, so pseudo-headings embedded in a
 *   fenced template (e.g. counterpart-spec examples) never corrupt section_path.
 */

export const MANUAL_PARSER_VERSION = "manual-parser-v1";

export interface ManualDocumentMetadata {
  versionLabel: string | null;
  status: string | null;
  author: string | null;
  created: string | null;
  updated: string | null;
}

export interface ParsedManualBlock {
  blockId: string;
  blockType: string | null;
  title: string | null;
  priority: string | null;
  status: string | null;
  ordinal: number;
  sectionPath: string[];
  metadata: Record<string, unknown>;
  bodyMarkdown: string;
  contentHash: string;
  relatedBlockIds: string[];
  lineStart: number;
  lineEnd: number;
  hasYamlError: boolean;
}

export interface YamlErrorDiagnostic {
  lineStart: number;
  lineEnd: number;
  heading: string | null;
  message: string;
  candidateBlockId: string | null;
}

export interface MissingIdCandidate {
  lineStart: number;
  lineEnd: number;
  heading: string | null;
}

export interface ManualParseResult {
  parserVersion: string;
  documentMetadata: ManualDocumentMetadata;
  blocks: ParsedManualBlock[];
  yamlErrors: YamlErrorDiagnostic[];
  missingIdCandidates: MissingIdCandidate[];
}

interface HeadingFrame {
  level: number;
  text: string;
}

interface Boundary {
  lineStart: number;
  lineEnd: number;
  blockId: string;
  metadata: Record<string, unknown>;
  hasYamlError: boolean;
  sectionPath: string[];
  title: string | null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

function extractField(text: string, label: string): string | null {
  const re = new RegExp(`\\*\\*${label}:\\*\\*\\s*(.+)`, "i");
  const match = text.match(re);
  return match ? match[1].trim() : null;
}

/**
 * Extracts the Manual's own '**Version:**'/'**Status:**'/'**Author:**'/'**Updated:**'/'**Created:**'
 * header fields from raw source text. Exported standalone so upload-time code can read the
 * version_label without running the full block parser (see src/lib/admin/manualActions.ts).
 */
export function extractDocumentMetadata(preambleText: string): ManualDocumentMetadata {
  return {
    versionLabel: extractField(preambleText, "Version"),
    status: extractField(preambleText, "Status"),
    author: extractField(preambleText, "Author"),
    created: extractField(preambleText, "Created"),
    updated: extractField(preambleText, "Updated"),
  };
}

const FENCE_OPEN_RE = /^```([A-Za-z0-9_-]*)\s*$/;
const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const TOP_LEVEL_ID_RE = /^id:\s*["']?([^"'\s#]+)/m;

export function parseManualMarkdown(source: string): ManualParseResult {
  const lines = source.split(/\r\n|\r|\n/);
  const headingStack: HeadingFrame[] = [];
  const yamlErrors: YamlErrorDiagnostic[] = [];
  const missingIdCandidates: MissingIdCandidate[] = [];
  const boundaries: Boundary[] = [];

  let insideFence = false;
  let fenceLang = "";
  let fenceStartLine = 0;
  let fenceContentLines: string[] = [];
  let fenceHeadingSnapshot: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const line = lines[i];

    if (!insideFence) {
      const fenceMatch = line.match(FENCE_OPEN_RE);
      if (fenceMatch) {
        insideFence = true;
        fenceLang = fenceMatch[1].toLowerCase();
        fenceStartLine = lineNo;
        fenceContentLines = [];
        fenceHeadingSnapshot = headingStack.map((h) => h.text);
        continue;
      }

      const headingMatch = line.match(HEADING_RE);
      if (headingMatch) {
        const level = headingMatch[1].length;
        const text = headingMatch[2].trim();
        while (headingStack.length && headingStack[headingStack.length - 1].level >= level) {
          headingStack.pop();
        }
        headingStack.push({ level, text });
      }
      continue;
    }

    // Inside a fence: only a bare ``` closes it, regardless of the opening language tag.
    if (line.trim() === "```") {
      const fenceEndLine = lineNo;
      const heading = fenceHeadingSnapshot.length ? fenceHeadingSnapshot[fenceHeadingSnapshot.length - 1] : null;

      if (fenceLang === "yaml") {
        const raw = fenceContentLines.join("\n");
        let parsed: unknown;
        let parseError: Error | null = null;
        try {
          parsed = yaml.load(raw);
        } catch (e) {
          parseError = e instanceof Error ? e : new Error(String(e));
        }

        if (parseError) {
          const candidateMatch = raw.match(TOP_LEVEL_ID_RE);
          const candidateBlockId = candidateMatch ? candidateMatch[1] : null;
          yamlErrors.push({
            lineStart: fenceStartLine,
            lineEnd: fenceEndLine,
            heading,
            message: parseError.message,
            candidateBlockId,
          });
          if (candidateBlockId) {
            // The fence clearly intended to declare a block (it has a top-level
            // `id:` line) even though it failed to parse — preserve the boundary
            // and the diagnostic rather than silently discarding the block.
            boundaries.push({
              lineStart: fenceStartLine,
              lineEnd: fenceEndLine,
              blockId: candidateBlockId,
              metadata: {},
              hasYamlError: true,
              sectionPath: [...fenceHeadingSnapshot],
              title: heading,
            });
          }
        } else if (isPlainObject(parsed) && typeof parsed.id === "string" && parsed.id.trim().length > 0) {
          boundaries.push({
            lineStart: fenceStartLine,
            lineEnd: fenceEndLine,
            blockId: parsed.id.trim(),
            metadata: parsed,
            hasYamlError: false,
            sectionPath: [...fenceHeadingSnapshot],
            title: heading,
          });
        } else if (isPlainObject(parsed) && "type" in parsed) {
          // Looks like it was meant to be block metadata (declares a `type`) but
          // has no top-level `id` — report it, do not silently invent one.
          missingIdCandidates.push({ lineStart: fenceStartLine, lineEnd: fenceEndLine, heading });
        }
      }

      insideFence = false;
      fenceLang = "";
      fenceContentLines = [];
      continue;
    }

    fenceContentLines.push(line);
  }

  const preambleEndLine = boundaries.length ? boundaries[0].lineStart - 1 : lines.length;
  const preambleText = lines.slice(0, preambleEndLine).join("\n");
  const documentMetadata = extractDocumentMetadata(preambleText);

  const blocks: ParsedManualBlock[] = boundaries.map((b, idx) => {
    const bodyStartLine = b.lineEnd + 1;
    const bodyEndExclusiveLine = idx + 1 < boundaries.length ? boundaries[idx + 1].lineStart - 1 : lines.length;
    const bodyMarkdown = lines.slice(bodyStartLine - 1, bodyEndExclusiveLine).join("\n").trim();
    const metadata = b.metadata;
    const relatedBlockIds = Array.isArray(metadata.related)
      ? metadata.related.filter((x): x is string => typeof x === "string")
      : [];
    const contentHash = sha256Hex(`${b.blockId}\n${JSON.stringify(metadata)}\n${bodyMarkdown}`);

    return {
      blockId: b.blockId,
      blockType: typeof metadata.type === "string" ? metadata.type : null,
      title: b.title,
      priority: typeof metadata.priority === "string" ? metadata.priority : null,
      status: typeof metadata.status === "string" ? metadata.status : null,
      ordinal: idx + 1,
      sectionPath: b.sectionPath,
      metadata,
      bodyMarkdown,
      contentHash,
      relatedBlockIds,
      lineStart: b.lineStart,
      lineEnd: b.lineEnd,
      hasYamlError: b.hasYamlError,
    };
  });

  return {
    parserVersion: MANUAL_PARSER_VERSION,
    documentMetadata,
    blocks,
    yamlErrors,
    missingIdCandidates,
  };
}
