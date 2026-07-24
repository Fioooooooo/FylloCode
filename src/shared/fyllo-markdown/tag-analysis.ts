export type FylloTagMarkdownDisposition = "candidate" | "literal";

export type FylloTagMarkdownContext = "markdown" | "inline_code" | "fenced_code";

export interface FylloTagMarkdownOccurrence {
  start: number;
  end: number;
  openingTagEnd: number;
  closingTagStart: number | null;
  raw: string;
  attrs: Record<string, string>;
  body: string;
  closed: boolean;
  sourceOrdinal: number;
  disposition: FylloTagMarkdownDisposition;
  context: FylloTagMarkdownContext;
}

export interface FylloTagMarkdownAnalysis {
  sourceLength: number;
  occurrences: FylloTagMarkdownOccurrence[];
}

export interface FylloTagMarkdownAnalysisOptions {
  tagName: string;
}

interface MarkdownCodeRange {
  start: number;
  end: number;
  context: Exclude<FylloTagMarkdownContext, "markdown">;
}

interface SourceLine {
  start: number;
  contentEnd: number;
  end: number;
}

// 解析 opening tag 中的单个属性，支持无值、双引号、单引号和无引号四种形式。
// 捕获组 2/3/4 分别保存三种属性值，消费方按顺序取第一个已匹配的值。
const fylloTagAttrPattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>/]+)))?/g;

function parseFylloTagAttrs(rawAttrs: string): Record<string, string> {
  return Object.fromEntries(
    Array.from(rawAttrs.matchAll(fylloTagAttrPattern), (match) => [
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

function findOpeningTagEnd(source: string, start: number, publicOpen: string): number | null {
  let quote: '"' | "'" | null = null;
  for (let index = start + publicOpen.length; index < source.length; index += 1) {
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
): FylloTagMarkdownContext {
  return (
    rangeContaining(fencedRanges, position)?.context ??
    rangeContaining(inlineRanges, position)?.context ??
    "markdown"
  );
}

/**
 * 按原始 Markdown 源码识别指定 public tag，并在 Markstream 解析前确定候选边界。
 * 这里只分析结构与源码 ordinal；各协议仍自行校验 type、JSON 和 payload schema。
 */
export function analyzeFylloTagMarkdown(
  source: string,
  options: FylloTagMarkdownAnalysisOptions
): FylloTagMarkdownAnalysis {
  if (!/^[a-z][a-z0-9-]*$/.test(options.tagName)) {
    throw new Error(`Invalid Fyllo tag name: ${options.tagName}`);
  }

  const publicOpen = `<${options.tagName}`;
  const publicClose = `</${options.tagName}>`;
  // 只定位完整 public opening tag 名称，避免把 `<fyllo-actionable>` 识别为 Action。
  const openingPattern = new RegExp(`<${options.tagName}(?=[\\s>])`, "g");
  const fencedRanges = collectFencedCodeRanges(source);
  const inlineRanges = collectInlineCodeRanges(source, fencedRanges);
  const occurrences: FylloTagMarkdownOccurrence[] = [];

  for (const match of source.matchAll(openingPattern)) {
    const start = match.index;
    const openingTagEnd = findOpeningTagEnd(source, start, publicOpen);
    if (openingTagEnd === null) {
      continue;
    }

    const closingTagStart = source.indexOf(publicClose, openingTagEnd);
    const closed = closingTagStart >= 0;
    const end = closed ? closingTagStart + publicClose.length : source.length;
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
      attrs: parseFylloTagAttrs(source.slice(start + publicOpen.length, openingTagEnd - 1)),
      body: source.slice(openingTagEnd, closed ? closingTagStart : source.length),
      closed,
      sourceOrdinal: occurrences.length,
      disposition,
      context,
    });
  }

  return { sourceLength: source.length, occurrences };
}
