import type { ManualParseResult, ParsedManualBlock, YamlErrorDiagnostic, MissingIdCandidate } from "@/lib/manual/parser";

/**
 * Structural / reference validation against the Manual's own `ret_metadata_schema`
 * contract (see docs/manual, section 1.8). This is deliberately NOT methodology
 * validation — it checks that the parsed blocks are internally consistent and
 * resolvable, never whether the methodology itself is correct. See CLAUDE.md /
 * the Stage B task: "parsed" must never be conflated with "validated".
 *
 * It never infers missing metadata from ID-name conventions (e.g. a `reg_*`
 * prefix is never used to invent `type: cultural_rule`) — a defect is reported,
 * not silently corrected.
 */

const CONTEXT_WILDCARD = "any";

export interface DuplicateIdDiagnostic {
  blockId: string;
  count: number;
  ordinals: number[];
}

export interface MissingTypeDiagnostic {
  blockId: string;
  line: number;
  heading: string | null;
}

export interface UnresolvedReferenceDiagnostic {
  blockId: string;
  referencedId: string;
  field: string;
}

export interface MalformedPlaybookDiagnostic {
  blockId: string;
  reason: string;
}

export interface BlockFieldDiagnostic {
  blockId: string;
  line: number;
}

/**
 * Severity contract (binding — see the Stage B cleanup task):
 *
 * `error` — the defect makes deterministic retrieval/validation structurally unreliable:
 * malformed YAML in a fence labelled `yaml` (whether or not it was ever a block-boundary
 * candidate), duplicate block IDs, unresolved references the contract requires to resolve
 * (related/rule_ids/tools/signals/contexts), a stale block-level `manual_version` field, or a
 * malformed playbook. These are never downgraded to warnings just because parsing of the
 * surrounding document was able to continue.
 *
 * `warning` — non-fatal conditions that remain structurally usable but deserve review: a block
 * missing an optional-but-expected `type`, a YAML fence that declares `type` with no `id`, or a
 * bare `context` field.
 *
 * `fatal` — narrower than "has errors": true only when the block set itself cannot be persisted
 * (currently: a duplicate block_id, which would violate manual_blocks' UNIQUE(manual_version_id,
 * block_id) constraint). A version may reach status `parsed` while `fatal` is false even if
 * `has_structural_errors` is true — parsing and methodology validation are different concepts
 * (see CLAUDE.md). Later validate/activate work must read `has_structural_errors` (or `errors`)
 * and refuse to validate/activate a version that has any.
 */
export interface ManualValidationReport {
  parser_version: string;
  total_blocks: number;
  duplicate_ids: DuplicateIdDiagnostic[];
  yaml_errors: YamlErrorDiagnostic[];
  missing_ids: MissingIdCandidate[];
  missing_types: MissingTypeDiagnostic[];
  unresolved_related_ids: UnresolvedReferenceDiagnostic[];
  unresolved_rule_ids: UnresolvedReferenceDiagnostic[];
  unresolved_tools: UnresolvedReferenceDiagnostic[];
  unresolved_signals: UnresolvedReferenceDiagnostic[];
  unresolved_contexts: UnresolvedReferenceDiagnostic[];
  stale_block_manual_version_fields: BlockFieldDiagnostic[];
  bare_context_metadata: BlockFieldDiagnostic[];
  malformed_playbooks: MalformedPlaybookDiagnostic[];
  errors: string[];
  warnings: string[];
  /** Deterministically `errors.length > 0` — see the severity contract above. */
  has_structural_errors: boolean;
  fatal: boolean;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((x): x is string => typeof x === "string") : [];
}

export function validateManualBlocks(parseResult: ManualParseResult): ManualValidationReport {
  const { blocks, yamlErrors, missingIdCandidates, parserVersion } = parseResult;

  const duplicateGroups = new Map<string, number[]>();
  for (const block of blocks) {
    const ordinals = duplicateGroups.get(block.blockId) ?? [];
    ordinals.push(block.ordinal);
    duplicateGroups.set(block.blockId, ordinals);
  }
  const duplicate_ids: DuplicateIdDiagnostic[] = [...duplicateGroups.entries()]
    .filter(([, ordinals]) => ordinals.length > 1)
    .map(([blockId, ordinals]) => ({ blockId, count: ordinals.length, ordinals }));

  const allBlockIds = new Set(blocks.map((b) => b.blockId));
  const toolIds = new Set(
    blocks.filter((b) => typeof b.metadata.tool_id === "string").map((b) => b.metadata.tool_id as string),
  );
  const signalIds = new Set(
    blocks.filter((b) => typeof b.metadata.signal_id === "string").map((b) => b.metadata.signal_id as string),
  );
  const contextIds = new Set(
    blocks.filter((b) => typeof b.metadata.context_id === "string").map((b) => b.metadata.context_id as string),
  );

  const missing_types: MissingTypeDiagnostic[] = [];
  const unresolved_related_ids: UnresolvedReferenceDiagnostic[] = [];
  const unresolved_rule_ids: UnresolvedReferenceDiagnostic[] = [];
  const unresolved_tools: UnresolvedReferenceDiagnostic[] = [];
  const unresolved_signals: UnresolvedReferenceDiagnostic[] = [];
  const unresolved_contexts: UnresolvedReferenceDiagnostic[] = [];
  const stale_block_manual_version_fields: BlockFieldDiagnostic[] = [];
  const bare_context_metadata: BlockFieldDiagnostic[] = [];
  const malformed_playbooks: MalformedPlaybookDiagnostic[] = [];

  for (const block of blocks) {
    if (block.hasYamlError) {
      // Metadata is unusable for this block — already captured in yaml_errors.
      continue;
    }

    if (!block.blockType) {
      missing_types.push({ blockId: block.blockId, line: block.lineStart, heading: block.title });
    }

    for (const ref of stringArray(block.metadata.related)) {
      if (!allBlockIds.has(ref)) {
        unresolved_related_ids.push({ blockId: block.blockId, referencedId: ref, field: "related" });
      }
    }
    for (const ref of stringArray(block.metadata.rule_ids)) {
      if (!allBlockIds.has(ref)) {
        unresolved_rule_ids.push({ blockId: block.blockId, referencedId: ref, field: "rule_ids" });
      }
    }

    for (const ref of stringArray(block.metadata.tools)) {
      if (!toolIds.has(ref)) {
        unresolved_tools.push({ blockId: block.blockId, referencedId: ref, field: "tools" });
      }
    }
    if (typeof block.metadata.target_technique === "string" && !toolIds.has(block.metadata.target_technique)) {
      unresolved_tools.push({ blockId: block.blockId, referencedId: block.metadata.target_technique, field: "target_technique" });
    }

    for (const ref of stringArray(block.metadata.signals)) {
      if (!signalIds.has(ref)) {
        unresolved_signals.push({ blockId: block.blockId, referencedId: ref, field: "signals" });
      }
    }

    if (
      typeof block.metadata.context_type === "string" &&
      block.metadata.context_type !== CONTEXT_WILDCARD &&
      !contextIds.has(block.metadata.context_type)
    ) {
      unresolved_contexts.push({ blockId: block.blockId, referencedId: block.metadata.context_type, field: "context_type" });
    }
    for (const ref of stringArray(block.metadata.contexts)) {
      if (ref !== CONTEXT_WILDCARD && !contextIds.has(ref)) {
        unresolved_contexts.push({ blockId: block.blockId, referencedId: ref, field: "contexts" });
      }
    }

    if ("manual_version" in block.metadata) {
      stale_block_manual_version_fields.push({ blockId: block.blockId, line: block.lineStart });
    }
    if ("context" in block.metadata) {
      bare_context_metadata.push({ blockId: block.blockId, line: block.lineStart });
    }

    if (block.blockType === "playbook") {
      const reasons: string[] = [];
      if (typeof block.metadata.context_type !== "string") reasons.push("missing context_type");
      if (!Array.isArray(block.metadata.tools)) reasons.push("missing or non-array tools");
      if (reasons.length > 0) {
        malformed_playbooks.push({ blockId: block.blockId, reason: reasons.join("; ") });
      }
    }
  }

  const errors: string[] = [];
  const warnings: string[] = [];

  if (duplicate_ids.length > 0) {
    errors.push(`${duplicate_ids.length} duplicate block id(s) found: ${duplicate_ids.map((d) => d.blockId).join(", ")}`);
  }
  if (yamlErrors.length > 0) {
    errors.push(`${yamlErrors.length} YAML metadata fence(s) failed to parse`);
  }
  if (unresolved_related_ids.length > 0) errors.push(`${unresolved_related_ids.length} unresolved 'related' reference(s)`);
  if (unresolved_rule_ids.length > 0) errors.push(`${unresolved_rule_ids.length} unresolved 'rule_ids' reference(s)`);
  if (unresolved_tools.length > 0) errors.push(`${unresolved_tools.length} unresolved tool reference(s)`);
  if (unresolved_signals.length > 0) errors.push(`${unresolved_signals.length} unresolved signal reference(s)`);
  if (unresolved_contexts.length > 0) errors.push(`${unresolved_contexts.length} unresolved context reference(s)`);
  if (stale_block_manual_version_fields.length > 0) {
    errors.push(`${stale_block_manual_version_fields.length} block(s) carry a stale block-level 'manual_version' field`);
  }
  if (malformed_playbooks.length > 0) errors.push(`${malformed_playbooks.length} malformed playbook block(s)`);

  if (missingIdCandidates.length > 0) {
    warnings.push(`${missingIdCandidates.length} YAML fence(s) declare 'type' but no top-level 'id'`);
  }
  if (missing_types.length > 0) warnings.push(`${missing_types.length} block(s) missing a 'type' field`);
  if (bare_context_metadata.length > 0) {
    warnings.push(`${bare_context_metadata.length} block(s) use a bare 'context' field instead of 'context_type'/'contexts'`);
  }

  return {
    parser_version: parserVersion,
    total_blocks: blocks.length,
    duplicate_ids,
    yaml_errors: yamlErrors,
    missing_ids: missingIdCandidates,
    missing_types,
    unresolved_related_ids,
    unresolved_rule_ids,
    unresolved_tools,
    unresolved_signals,
    unresolved_contexts,
    stale_block_manual_version_fields,
    bare_context_metadata,
    malformed_playbooks,
    errors,
    warnings,
    has_structural_errors: errors.length > 0,
    // Only a duplicate block id is fatal here: it is the one defect that cannot
    // be persisted at all (manual_blocks enforces UNIQUE(manual_version_id, block_id)).
    // Every other defect is reported but does not block a status: parsed transition —
    // has_structural_errors (above) is what a later validate/activate stage must consult.
    fatal: duplicate_ids.length > 0,
  };
}

export function blockToInsertRow(block: ParsedManualBlock) {
  return {
    block_id: block.blockId,
    block_type: block.blockType,
    title: block.title,
    priority: block.priority,
    status: block.status,
    ordinal: block.ordinal,
    section_path: block.sectionPath,
    metadata: block.metadata,
    body_markdown: block.bodyMarkdown,
    content_hash: block.contentHash,
    related_block_ids: block.relatedBlockIds,
  };
}
