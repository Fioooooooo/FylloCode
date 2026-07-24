import { describe, expect, it } from "vitest";
import { getMarkdown, parseMarkdownToStructure, type ParsedNode } from "stream-markdown-parser";
import {
  createFylloActionNodeTransformer,
  fylloActionMarkstreamCustomHtmlTags,
  prepareFylloActionMarkdown,
} from "@renderer/features/fyllo-action/integration";
import {
  createFylloSignalNodeTransformer,
  fylloSignalMarkstreamCustomHtmlTags,
  prepareFylloSignalMarkdown,
} from "@renderer/features/fyllo-signal/integration";

function collectNodeTypes(nodes: ParsedNode[]): string[] {
  const types: string[] = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== "object") {
      return;
    }
    const record = value as Record<string, unknown>;
    if (typeof record.type === "string") {
      types.push(record.type);
    }
    for (const field of ["children", "items", "rows", "cells", "term", "definition"]) {
      visit(record[field]);
    }
  };
  visit(nodes);
  return types;
}

function parseMixed(source: string, final = true): ParsedNode[] {
  const action = prepareFylloActionMarkdown(source);
  const signal = prepareFylloSignalMarkdown(action.content);
  const actionTransform = createFylloActionNodeTransformer(action);
  const signalTransform = createFylloSignalNodeTransformer(signal);

  return parseMarkdownToStructure(signal.content, getMarkdown(), {
    customHtmlTags: [
      ...fylloActionMarkstreamCustomHtmlTags,
      ...fylloSignalMarkstreamCustomHtmlTags,
    ],
    final,
    streamParse: false,
    postTransformNodes: (nodes) => signalTransform(actionTransform(nodes)),
  });
}

describe("Fyllo Signal Markstream integration", () => {
  it("renders closed Action and Signal candidates through independent internal nodes", () => {
    const nodes = parseMixed(
      [
        '<fyllo-action type="task.create">{"title":"ready"}</fyllo-action>',
        '<fyllo-signal type="show.time">{"label":"2026-07-24 10:30"}</fyllo-signal>',
      ].join("\n\n")
    );
    const types = collectNodeTypes(nodes);

    expect(types).toContain(fylloActionMarkstreamCustomHtmlTags[0]);
    expect(types).toContain(fylloSignalMarkstreamCustomHtmlTags[0]);
    expect(JSON.stringify(nodes)).not.toContain("FYLLO_ACTION_LITERAL");
    expect(JSON.stringify(nodes)).not.toContain("FYLLO_SIGNAL_LITERAL");
  });

  it("keeps unclosed and prose Signals on the ordinary Markdown path", () => {
    const unclosed = '<fyllo-signal type="show.time">{"label":"streaming"}';
    const prose = 'Example: <fyllo-signal type="show.time">{"label":"literal"}</fyllo-signal>';
    const nodes = [...parseMixed(unclosed, false), ...parseMixed(prose, false)];
    const serialized = JSON.stringify(nodes);

    expect(collectNodeTypes(nodes)).not.toContain(fylloSignalMarkstreamCustomHtmlTags[0]);
    expect(serialized).toContain("fyllo-signal");
    expect(serialized).not.toContain("FYLLO_SIGNAL_LITERAL");
  });
});
