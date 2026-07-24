import type {
  FylloTagMarkdownAnalysis,
  FylloTagMarkdownOccurrence,
} from "@shared/fyllo-markdown/tag-analysis";
import type { NodeRendererProps } from "markstream-vue";

type MarkstreamParseOptions = NonNullable<NodeRendererProps["parseOptions"]>;
export type FylloTagPostTransformNodes = NonNullable<MarkstreamParseOptions["postTransformNodes"]>;
type MarkstreamNode = Parameters<FylloTagPostTransformNodes>[0][number];

export interface FylloTagTransportConfig {
  publicTagName: string;
  internalTagName: string;
  placeholderNamespace: string;
}

export interface FylloTagLiteralPlaceholder {
  token: string;
  raw: string;
  start: number;
  end: number;
  sourceOrdinal: number;
}

export interface PreparedFylloTagMarkdown<
  Analysis extends FylloTagMarkdownAnalysis = FylloTagMarkdownAnalysis,
> {
  content: string;
  analysis: Analysis;
  candidates: FylloTagMarkdownOccurrence[];
  placeholders: FylloTagLiteralPlaceholder[];
}

const nestedNodeArrayFields = ["children", "items", "rows", "cells", "term", "definition"] as const;

function assertTransportConfig(config: FylloTagTransportConfig): void {
  for (const value of [config.publicTagName, config.internalTagName, config.placeholderNamespace]) {
    if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(value)) {
      throw new Error(`Invalid Fyllo tag transport identifier: ${value}`);
    }
  }
}

function createPlaceholderPrefix(source: string, config: FylloTagTransportConfig): string {
  let attempt = 0;
  let prefix = "";
  do {
    prefix = `\uE000${config.placeholderNamespace}_${attempt}_`;
    attempt += 1;
  } while (source.includes(prefix));
  return prefix;
}

function renderInternalCandidate(
  source: string,
  occurrence: FylloTagMarkdownOccurrence,
  config: FylloTagTransportConfig
): string {
  const publicOpen = `<${config.publicTagName}`;
  const openingTail = source.slice(occurrence.start + publicOpen.length, occurrence.openingTagEnd);
  return [
    `<${config.internalTagName}${openingTail}`,
    occurrence.body,
    `</${config.internalTagName}>`,
  ].join("");
}

/**
 * 将 shared structural analysis 转成 Markstream 专用内容。
 * 协议语义、注册和状态管理仍由各 feature adapter 负责。
 */
export function prepareFylloTagMarkdown<Analysis extends FylloTagMarkdownAnalysis>(
  source: string,
  analysis: Analysis,
  config: FylloTagTransportConfig
): PreparedFylloTagMarkdown<Analysis> {
  assertTransportConfig(config);
  const candidates = analysis.occurrences.filter(
    (occurrence) => occurrence.disposition === "candidate"
  );
  const placeholders: FylloTagLiteralPlaceholder[] = [];
  const placeholderPrefix = createPlaceholderPrefix(source, config);
  const chunks: string[] = [];
  let cursor = 0;

  for (const occurrence of analysis.occurrences) {
    if (occurrence.start < cursor) {
      continue;
    }
    if (occurrence.disposition === "literal" && occurrence.context !== "markdown") {
      continue;
    }

    chunks.push(source.slice(cursor, occurrence.start));
    if (occurrence.disposition === "candidate") {
      chunks.push(renderInternalCandidate(source, occurrence, config));
    } else {
      const token = `${placeholderPrefix}${occurrence.sourceOrdinal}\uE001`;
      placeholders.push({
        token,
        raw: occurrence.raw,
        start: occurrence.start,
        end: occurrence.end,
        sourceOrdinal: occurrence.sourceOrdinal,
      });
      chunks.push(token);
    }
    cursor = occurrence.end;
  }

  chunks.push(source.slice(cursor));
  return { content: chunks.join(""), analysis, candidates, placeholders };
}

function restorePlaceholders(value: string, placeholders: FylloTagLiteralPlaceholder[]): string {
  return placeholders.reduce(
    (restored, placeholder) => restored.split(placeholder.token).join(placeholder.raw),
    value
  );
}

function transformNode(
  node: MarkstreamNode,
  placeholders: FylloTagLiteralPlaceholder[],
  internalTagName: string
): MarkstreamNode {
  if (node.type === internalTagName) {
    return node;
  }

  const record = node as unknown as Record<string, unknown>;
  const transformed: Record<string, unknown> = { ...record };
  if (typeof record.raw === "string") {
    transformed.raw = restorePlaceholders(record.raw, placeholders);
  }
  if (node.type === "text" && typeof record.content === "string") {
    transformed.content = restorePlaceholders(record.content, placeholders);
  }

  for (const field of nestedNodeArrayFields) {
    const value = record[field];
    if (Array.isArray(value)) {
      transformed[field] = value.map((child) =>
        child && typeof child === "object" && "type" in child
          ? transformNode(child as MarkstreamNode, placeholders, internalTagName)
          : child
      );
    }
  }

  return transformed as unknown as MarkstreamNode;
}

export function createFylloTagNodeTransformer(
  prepared: Pick<PreparedFylloTagMarkdown, "placeholders">,
  config: FylloTagTransportConfig
): FylloTagPostTransformNodes {
  assertTransportConfig(config);
  return (nodes) =>
    nodes.map((node) => transformNode(node, prepared.placeholders, config.internalTagName));
}
