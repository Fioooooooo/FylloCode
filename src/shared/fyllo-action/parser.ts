import { getFylloActionContract, isValidFylloActionTypeName } from "./registry";
import type {
  FylloActionInvalidParseResult,
  FylloActionMarkdownAnalysis,
  FylloActionMarkdownContext,
  FylloActionMarkdownNode,
  FylloActionMarkdownOccurrence,
  FylloActionParseErrorCode,
  FylloActionParseResult,
  FylloActionReadyParseResult,
  ParsedFylloActionSource,
} from "./protocol";

const FYLLO_ACTION_OPEN = "<fyllo-action";
const FYLLO_ACTION_CLOSE = "</fyllo-action>";

// 只定位 public opening tag；attrs、body 和闭合边界由下面的源码扫描器解析。
const fylloActionOpeningPattern = /<fyllo-action(?=[\s>])/g;

// 解析 opening tag 中的单个属性，支持无值、双引号、单引号和无引号四种形式。
// 捕获组 2/3/4 分别保存三种属性值，消费方按顺序取第一个已匹配的值。
const fylloActionAttrPattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>/]+)))?/g;

interface MarkdownCodeRange {
  start: number;
  end: number;
  context: Exclude<FylloActionMarkdownContext, "markdown">;
}

interface SourceLine {
  start: number;
  contentEnd: number;
  end: number;
}

function invalid(
  code: FylloActionParseErrorCode,
  message: string,
  options: { type?: string; details?: string[] } = {}
): FylloActionInvalidParseResult {
  return {
    status: "invalid",
    type: options.type,
    error: {
      code,
      message,
      details: options.details,
    },
  };
}

function getAttrEntries(attrs: FylloActionMarkdownNode["attrs"]): Array<[string, unknown]> {
  if (!attrs) {
    return [];
  }

  if (Array.isArray(attrs)) {
    return attrs.filter((entry): entry is [string, unknown] => typeof entry[0] === "string");
  }

  return Object.entries(attrs);
}

function formatValidationIssues(issues: Array<{ path: PropertyKey[]; message: string }>): string[] {
  return issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "payload";
    return `${path}: ${issue.message}`;
  });
}

function parseFylloActionAttrs(rawAttrs: string): Record<string, string> {
  // match[1] 是属性名；match[2..4] 分别对应双引号、单引号和无引号值。
  return Object.fromEntries(
    Array.from(rawAttrs.matchAll(fylloActionAttrPattern), (match) => [
      match[1],
      match[2] ?? match[3] ?? match[4] ?? "",
    ])
  );
}

function collectSourceLines(source: string): SourceLine[] {
  const lines: SourceLine[] = [];
  let start = 0;

  while (start < source.length) {
    const newline = source.indexOf("\n", start);
    const end = newline >= 0 ? newline + 1 : source.length;
    let contentEnd = newline >= 0 ? newline : source.length;
    if (contentEnd > start && source[contentEnd - 1] === "\r") {
      contentEnd -= 1;
    }
    lines.push({ start, contentEnd, end });
    start = end;
  }

  return lines;
}

function collectFencedCodeRanges(source: string): MarkdownCodeRange[] {
  const lines = collectSourceLines(source);
  const ranges: MarkdownCodeRange[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const content = source.slice(line.start, line.contentEnd);
    const opening = content.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (!opening) {
      continue;
    }

    const marker = opening[1];
    if (marker[0] === "`" && opening[2].includes("`")) {
      continue;
    }

    let end = source.length;
    let closingIndex = lines.length;
    for (let candidateIndex = index + 1; candidateIndex < lines.length; candidateIndex += 1) {
      const candidateLine = lines[candidateIndex];
      const candidate = source
        .slice(candidateLine.start, candidateLine.contentEnd)
        .match(/^ {0,3}(`+|~+)[ \t]*$/);
      if (candidate && candidate[1][0] === marker[0] && candidate[1].length >= marker.length) {
        end = candidateLine.end;
        closingIndex = candidateIndex;
        break;
      }
    }

    ranges.push({ start: line.start, end, context: "fenced_code" });
    index = closingIndex;
  }

  return ranges;
}

function rangeContaining(ranges: MarkdownCodeRange[], position: number): MarkdownCodeRange | null {
  return ranges.find((range) => position >= range.start && position < range.end) ?? null;
}

function collectInlineCodeRanges(
  source: string,
  fencedRanges: MarkdownCodeRange[]
): MarkdownCodeRange[] {
  const ranges: MarkdownCodeRange[] = [];
  let cursor = 0;

  while (cursor < source.length) {
    const fencedRange = rangeContaining(fencedRanges, cursor);
    if (fencedRange) {
      cursor = fencedRange.end;
      continue;
    }

    if (source[cursor] !== "`") {
      cursor += 1;
      continue;
    }

    let runEnd = cursor + 1;
    while (source[runEnd] === "`") {
      runEnd += 1;
    }
    const runLength = runEnd - cursor;
    let closingEnd = source.length;
    let search = runEnd;

    while (search < source.length) {
      const searchFence = rangeContaining(fencedRanges, search);
      if (searchFence) {
        search = searchFence.end;
        continue;
      }
      if (source[search] !== "`") {
        search += 1;
        continue;
      }

      let candidateEnd = search + 1;
      while (source[candidateEnd] === "`") {
        candidateEnd += 1;
      }
      if (candidateEnd - search === runLength) {
        closingEnd = candidateEnd;
        break;
      }
      search = candidateEnd;
    }

    ranges.push({ start: cursor, end: closingEnd, context: "inline_code" });
    cursor = closingEnd;
  }

  return ranges;
}

function findOpeningTagEnd(source: string, start: number): number | null {
  let quote: '"' | "'" | null = null;
  for (let index = start + FYLLO_ACTION_OPEN.length; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (character === quote) {
        quote = null;
      }
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === ">") {
      return index + 1;
    }
  }
  return null;
}

function lineStartAt(source: string, position: number): number {
  return source.lastIndexOf("\n", Math.max(0, position - 1)) + 1;
}

function hasBlankLineBefore(source: string, openingStart: number): boolean {
  const openingLineStart = lineStartAt(source, openingStart);
  const linePrefix = source.slice(openingLineStart, openingStart);
  if (!/^ {0,3}$/.test(linePrefix)) {
    return false;
  }
  if (openingLineStart === 0) {
    return true;
  }

  const previousLineEnd = openingLineStart - 1;
  const previousLineStart = lineStartAt(source, previousLineEnd);
  return /^[ \t\r]*$/.test(source.slice(previousLineStart, previousLineEnd));
}

function hasBlankLineAfter(source: string, closingEnd: number): boolean {
  const closingLineEnd = source.indexOf("\n", closingEnd);
  const lineEnd = closingLineEnd >= 0 ? closingLineEnd : source.length;
  if (!/^[ \t\r]*$/.test(source.slice(closingEnd, lineEnd))) {
    return false;
  }
  if (closingLineEnd < 0 || closingLineEnd + 1 >= source.length) {
    return true;
  }

  const nextLineStart = closingLineEnd + 1;
  const nextLineEnd = source.indexOf("\n", nextLineStart);
  return /^[ \t\r]*$/.test(
    source.slice(nextLineStart, nextLineEnd >= 0 ? nextLineEnd : source.length)
  );
}

function getMarkdownContext(
  position: number,
  fencedRanges: MarkdownCodeRange[],
  inlineRanges: MarkdownCodeRange[]
): FylloActionMarkdownContext {
  return (
    rangeContaining(fencedRanges, position)?.context ??
    rangeContaining(inlineRanges, position)?.context ??
    "markdown"
  );
}

/**
 * 按原始 Markdown 源码识别 Action occurrence，并在 Markstream 解析前确定候选边界。
 * 该分析只负责结构和源码 ordinal；attrs、JSON 与 payload schema 仍由 semantic parser 校验。
 */
export function analyzeFylloActionMarkdown(source: string): FylloActionMarkdownAnalysis {
  const fencedRanges = collectFencedCodeRanges(source);
  const inlineRanges = collectInlineCodeRanges(source, fencedRanges);
  const occurrences: FylloActionMarkdownOccurrence[] = [];

  for (const match of source.matchAll(fylloActionOpeningPattern)) {
    const start = match.index;
    const openingTagEnd = findOpeningTagEnd(source, start);
    if (openingTagEnd === null) {
      continue;
    }

    const closingTagStart = source.indexOf(FYLLO_ACTION_CLOSE, openingTagEnd);
    const closed = closingTagStart >= 0;
    const end = closed ? closingTagStart + FYLLO_ACTION_CLOSE.length : source.length;
    const context = getMarkdownContext(start, fencedRanges, inlineRanges);
    const disposition =
      closed &&
      context === "markdown" &&
      hasBlankLineBefore(source, start) &&
      hasBlankLineAfter(source, end)
        ? "candidate"
        : "literal";

    occurrences.push({
      start,
      end,
      openingTagEnd,
      closingTagStart: closed ? closingTagStart : null,
      raw: source.slice(start, end),
      attrs: parseFylloActionAttrs(
        source.slice(start + FYLLO_ACTION_OPEN.length, openingTagEnd - 1)
      ),
      body: source.slice(openingTagEnd, closed ? closingTagStart : source.length),
      closed,
      sourceOrdinal: occurrences.length,
      disposition,
      context,
    });
  }

  return { sourceLength: source.length, occurrences };
}

export function collectFylloActionSources(source: string): ParsedFylloActionSource[] {
  return analyzeFylloActionMarkdown(source).occurrences.map((occurrence) => ({
    attrs: occurrence.attrs,
    content: occurrence.body,
    loading: !occurrence.closed,
  }));
}

export function parseFylloActionNode(node: FylloActionMarkdownNode): FylloActionParseResult {
  const attrEntries = getAttrEntries(node.attrs);
  const extraAttrs = attrEntries.map(([name]) => name).filter((name) => name !== "type");
  const rawType = attrEntries.find(([name]) => name === "type")?.[1];
  const type = typeof rawType === "string" ? rawType : undefined;

  // The contract only allows the `type` attribute; reject anything else so that
  // future extensions (e.g. version/id) are not silently misinterpreted.
  if (extraAttrs.length > 0) {
    return invalid("unexpected_attribute", "Only the type attribute is allowed.", {
      type,
      details: extraAttrs.map((name) => `Unexpected attribute: ${name}`),
    });
  }

  // A loading node has not received its payload yet; defer validation until closed.
  if (node.loading === true) {
    return {
      status: "pending",
      type,
    };
  }

  if (type === undefined || type.length === 0) {
    return invalid("missing_type", "Fyllo action type is required.");
  }

  if (!isValidFylloActionTypeName(type)) {
    return invalid("invalid_type_name", "Fyllo action type must use domain.action syntax.", {
      type,
    });
  }

  const contract = getFylloActionContract(type);
  if (!contract) {
    return invalid("unknown_type", `Unsupported Fyllo action type: ${type}.`, {
      type,
    });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(String(node.content ?? "").trim());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid JSON payload.";
    return invalid("invalid_json", message, { type });
  }

  const parsedPayload = contract.payloadSchema.safeParse(payload);

  if (!parsedPayload.success) {
    return invalid("invalid_payload", "Fyllo action payload does not match the schema.", {
      type,
      details: formatValidationIssues(parsedPayload.error.issues),
    });
  }

  return {
    status: "ready",
    type: contract.type,
    payload: parsedPayload.data,
  } as FylloActionReadyParseResult;
}
