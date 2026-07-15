import { describe, expect, it } from "vitest";
import { getMarkdown, parseMarkdownToStructure, type ParsedNode } from "stream-markdown-parser";
import {
  createFylloActionNodeTransformer,
  createFylloActionOrdinalResolver,
  fylloActionMarkstreamCustomHtmlTags,
  prepareFylloActionMarkdown,
} from "@renderer/features/fyllo-action/integration";

const action = (title: string): string =>
  `<fyllo-action type="task.create">{"title":"${title}"}</fyllo-action>`;

function parsePrepared(
  source: string,
  final = true
): {
  prepared: ReturnType<typeof prepareFylloActionMarkdown>;
  nodes: ParsedNode[];
} {
  const prepared = prepareFylloActionMarkdown(source);
  const nodes = parseMarkdownToStructure(prepared.content, getMarkdown(), {
    customHtmlTags: fylloActionMarkstreamCustomHtmlTags,
    final,
    streamParse: false,
    postTransformNodes: createFylloActionNodeTransformer(prepared),
  });
  return { prepared, nodes };
}

function collectNodes(nodes: ParsedNode[]): ParsedNode[] {
  const collected: ParsedNode[] = [];
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
      collected.push(value as ParsedNode);
    }
    for (const field of ["children", "items", "rows", "cells", "term", "definition"]) {
      visit(record[field]);
    }
  };
  visit(nodes);
  return collected;
}

function serializedNodes(nodes: ParsedNode[]): string {
  return JSON.stringify(nodes);
}

describe("Fyllo Action Markstream integration", () => {
  it.each([
    { name: "inline code", source: `\`${action("inline")}\``, expectedType: "inline_code" },
    {
      name: "backtick fence",
      source: `\`\`\`text\n${action("fenced")}\n\`\`\``,
      expectedType: "code_block",
    },
  ])("keeps $name on the native code path", ({ source, expectedType }) => {
    const { prepared, nodes } = parsePrepared(source);
    const flattened = collectNodes(nodes);

    expect(prepared.placeholders).toHaveLength(0);
    expect(flattened.some((node) => node.type === expectedType)).toBe(true);
    expect(flattened.some((node) => node.type === fylloActionMarkstreamCustomHtmlTags[0])).toBe(
      false
    );
  });

  it("does not flash an action for an unclosed inline-code prefix", () => {
    const source = `\`<fyllo-action type="task.create">{"title":"streaming"}`;
    const { nodes } = parsePrepared(source, false);

    expect(
      collectNodes(nodes).some((node) => node.type === fylloActionMarkstreamCustomHtmlTags[0])
    ).toBe(false);
    expect(serializedNodes(nodes)).toContain("fyllo-action");
  });

  it.each([
    { source: `用法是 ${action("example")}，不是动作`, expected: '\\"title\\"' },
    {
      source: '<fyllo-action type="task.create"> 的用法是说明文字',
      expected: "用法是说明文字",
    },
  ])(
    "restores prose literals from original source without quote normalization",
    ({ source, expected }) => {
      const { prepared, nodes } = parsePrepared(source);
      const serialized = serializedNodes(nodes);

      expect(prepared.placeholders).toHaveLength(1);
      expect(serialized).toContain('\\"task.create\\"');
      expect(serialized).toContain(expected);
      expect(serialized).not.toContain("FYLLO_ACTION_LITERAL");
      expect(
        collectNodes(nodes).some((node) => node.type === fylloActionMarkstreamCustomHtmlTags[0])
      ).toBe(false);
    }
  );

  it("renders only a closed standalone candidate through the internal node", () => {
    const streaming = parsePrepared('<fyllo-action type="task.create">{"title":"x"}', false);
    const closed = parsePrepared(action("x"), false);

    expect(
      collectNodes(streaming.nodes).some(
        (node) => node.type === fylloActionMarkstreamCustomHtmlTags[0]
      )
    ).toBe(false);
    expect(
      collectNodes(closed.nodes).some(
        (node) => node.type === fylloActionMarkstreamCustomHtmlTags[0]
      )
    ).toBe(true);
  });

  it("keeps literal-before-candidate ordinal and mixed rendering stable", () => {
    const source = [`示例：${action("same")}`, action("same")].join("\n\n");
    const { prepared, nodes } = parsePrepared(source);
    const internalNode = collectNodes(nodes).find(
      (node) => node.type === fylloActionMarkstreamCustomHtmlTags[0]
    );
    const resolveOrdinal = createFylloActionOrdinalResolver(prepared.analysis);

    expect(prepared.analysis.occurrences.map((item) => item.sourceOrdinal)).toEqual([0, 1]);
    expect(internalNode).toBeDefined();
    expect(resolveOrdinal(internalNode!)).toBe(1);
    expect(serializedNodes(nodes)).not.toContain("FYLLO_ACTION_LITERAL");
  });

  it("refuses to resolve a public or literal node as an action", () => {
    const prepared = prepareFylloActionMarkdown(action("x"));
    const resolveOrdinal = createFylloActionOrdinalResolver(prepared.analysis);

    expect(
      resolveOrdinal({
        type: "fyllo-action",
        raw: action("x"),
        content: '{"title":"x"}',
      })
    ).toBeNull();
  });

  it("generates collision-free placeholders and never rewrites internal nodes", () => {
    const source = `\uE000FYLLO_ACTION_LITERAL_0_0\uE001\n\n用法是 ${action("x")}`;
    const prepared = prepareFylloActionMarkdown(source);
    const internalNode = {
      type: fylloActionMarkstreamCustomHtmlTags[0],
      raw: "unchanged",
      content: "unchanged",
    } as unknown as ParsedNode;
    const transformed = createFylloActionNodeTransformer(prepared)([internalNode]);

    expect(prepared.placeholders[0].token).not.toBe("\uE000FYLLO_ACTION_LITERAL_0_0\uE001");
    expect(transformed[0]).toBe(internalNode);
  });
});
