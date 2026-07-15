import FylloActionNode from "../ui/FylloActionNode.vue";
import { analyzeFylloActionMarkdown } from "@shared/fyllo-action/parser";
import type {
  FylloActionMarkdownAnalysis,
  FylloActionMarkdownOccurrence,
  FylloActionState,
} from "@shared/fyllo-action/protocol";
import type { NodeRendererProps } from "markstream-vue";

export { FylloActionNode };

const PUBLIC_FYLLO_ACTION_OPEN = "<fyllo-action";
const PUBLIC_FYLLO_ACTION_CLOSE = "</fyllo-action>";
const INTERNAL_FYLLO_ACTION_TAG = "fyllo-action-render";

export const fylloActionMarkstreamCustomHtmlTags = [INTERNAL_FYLLO_ACTION_TAG] as const;

export interface FylloActionHostContextInput {
  projectId: string;
  sessionId: string;
  messageIndex: number;
  partIndex: number;
  actionStates?: Record<string, FylloActionState>;
  persistActionState: (actionId: string, state: FylloActionState) => Promise<void>;
  transitionAction: (input: {
    projectId: string;
    sessionId: string;
    actionId: string;
    command: "succeed" | "fail" | "cancel";
    expectedRevision: number;
    error?: string;
  }) => Promise<FylloActionState>;
  transitionActions: (input: {
    projectId: string;
    sessionId: string;
    actionIds: string[];
    command: "succeed" | "fail" | "cancel";
    expectedRevisions: Record<string, number>;
    error?: string;
  }) => Promise<
    Array<{ actionId: string; success: boolean; record?: FylloActionState; error?: string }>
  >;
}

export interface FylloActionLiteralPlaceholder {
  token: string;
  raw: string;
  start: number;
  end: number;
  sourceOrdinal: number;
}

export interface FylloActionOrdinalNode {
  type?: string;
  raw?: string;
  content?: string;
}

export interface PreparedFylloActionMarkdown {
  content: string;
  analysis: FylloActionMarkdownAnalysis;
  candidates: FylloActionMarkdownOccurrence[];
  placeholders: FylloActionLiteralPlaceholder[];
}

type MarkstreamParseOptions = NonNullable<NodeRendererProps["parseOptions"]>;
type PostTransformNodes = NonNullable<MarkstreamParseOptions["postTransformNodes"]>;
type MarkstreamNode = Parameters<PostTransformNodes>[0][number];

const nestedNodeArrayFields = ["children", "items", "rows", "cells", "term", "definition"] as const;

function createPlaceholderPrefix(source: string): string {
  let attempt = 0;
  let prefix = "";
  do {
    prefix = `\uE000FYLLO_ACTION_LITERAL_${attempt}_`;
    attempt += 1;
  } while (source.includes(prefix));
  return prefix;
}

function renderInternalCandidate(
  source: string,
  occurrence: FylloActionMarkdownOccurrence
): string {
  const openingTail = source.slice(
    occurrence.start + PUBLIC_FYLLO_ACTION_OPEN.length,
    occurrence.openingTagEnd
  );
  return [
    `<${INTERNAL_FYLLO_ACTION_TAG}${openingTail}`,
    occurrence.body,
    `</${INTERNAL_FYLLO_ACTION_TAG}>`,
  ].join("");
}

/**
 * 为 Markstream 生成 render-only Markdown。原始消息不会被修改，内部标签和占位符
 * 也不会进入 public Action payload 或持久化 identity。
 */
export function prepareFylloActionMarkdown(
  source: string,
  analysis: FylloActionMarkdownAnalysis = analyzeFylloActionMarkdown(source)
): PreparedFylloActionMarkdown {
  const candidates = analysis.occurrences.filter(
    (occurrence) => occurrence.disposition === "candidate"
  );
  const placeholders: FylloActionLiteralPlaceholder[] = [];
  const placeholderPrefix = createPlaceholderPrefix(source);
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
      chunks.push(renderInternalCandidate(source, occurrence));
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

function restorePlaceholders(value: string, placeholders: FylloActionLiteralPlaceholder[]): string {
  return placeholders.reduce(
    (restored, placeholder) => restored.split(placeholder.token).join(placeholder.raw),
    value
  );
}

function transformNode(
  node: MarkstreamNode,
  placeholders: FylloActionLiteralPlaceholder[]
): MarkstreamNode {
  if (node.type === INTERNAL_FYLLO_ACTION_TAG) {
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
          ? transformNode(child as MarkstreamNode, placeholders)
          : child
      );
    }
  }

  return transformed as unknown as MarkstreamNode;
}

export function createFylloActionNodeTransformer(
  prepared: Pick<PreparedFylloActionMarkdown, "placeholders">
): PostTransformNodes {
  return (nodes) => nodes.map((node) => transformNode(node, prepared.placeholders));
}

function normalizeInternalRaw(raw: string): string {
  return raw
    .split(`<${INTERNAL_FYLLO_ACTION_TAG}`)
    .join(PUBLIC_FYLLO_ACTION_OPEN)
    .split(`</${INTERNAL_FYLLO_ACTION_TAG}>`)
    .join(PUBLIC_FYLLO_ACTION_CLOSE);
}

/**
 * 将 internal rendered node 映射回 shared analysis 的源码 ordinal。
 * 同一 node object 重复解析时使用 WeakMap 保持稳定；重复 payload 首次出现时按 candidate 源码顺序分配。
 */
export function createFylloActionOrdinalResolver(
  analysis: FylloActionMarkdownAnalysis
): (node: FylloActionOrdinalNode) => number | null {
  const candidates = analysis.occurrences.filter(
    (occurrence) => occurrence.disposition === "candidate"
  );
  const claimedSourceOrdinals = new Set<number>();
  const nodeAssignments = new WeakMap<object, number>();

  return (node) => {
    if (node.type !== INTERNAL_FYLLO_ACTION_TAG) {
      return null;
    }
    if (typeof node === "object" && nodeAssignments.has(node)) {
      return nodeAssignments.get(node) ?? null;
    }

    const raw = node.raw ? normalizeInternalRaw(node.raw) : undefined;
    const content = node.content?.trim();
    const matches = candidates.filter(
      (candidate) =>
        Boolean(raw && raw === candidate.raw) ||
        Boolean(content && content === candidate.body.trim())
    );
    const candidate =
      matches.find((item) => !claimedSourceOrdinals.has(item.sourceOrdinal)) ??
      (matches.length === 1 ? matches[0] : undefined) ??
      candidates.find((item) => !claimedSourceOrdinals.has(item.sourceOrdinal));
    if (!candidate) {
      return null;
    }

    claimedSourceOrdinals.add(candidate.sourceOrdinal);
    if (typeof node === "object") {
      nodeAssignments.set(node, candidate.sourceOrdinal);
    }
    return candidate.sourceOrdinal;
  };
}
