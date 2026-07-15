import { describe, expect, it } from "vitest";
import {
  analyzeFylloActionMarkdown,
  collectFylloActionSources,
  parseFylloActionNode,
} from "@shared/fyllo-action/parser";

const action = (title: string): string =>
  `<fyllo-action type="task.create">{"title":"${title}"}</fyllo-action>`;

describe("collectFylloActionSources", () => {
  it("collects closed action tags", () => {
    const sources = collectFylloActionSources(
      '<fyllo-action type="task.create">{"title":"x"}</fyllo-action>'
    );
    expect(sources).toHaveLength(1);
    expect(sources[0]).toEqual({
      attrs: { type: "task.create" },
      content: '{"title":"x"}',
      loading: false,
    });
  });

  it("marks unclosed tags as loading", () => {
    const sources = collectFylloActionSources('<fyllo-action type="task.create">{"title":"x"}');
    expect(sources).toHaveLength(1);
    expect(sources[0].loading).toBe(true);
  });
});

describe("analyzeFylloActionMarkdown", () => {
  it.each([
    { name: "document start", source: action("start"), disposition: "candidate" },
    {
      name: "three-space indentation",
      source: `   ${action("indented")}`,
      disposition: "candidate",
    },
    {
      name: "four-space indentation",
      source: `    ${action("code")}`,
      disposition: "literal",
    },
    {
      name: "prose prefix",
      source: `用法是 ${action("example")}`,
      disposition: "literal",
    },
    {
      name: "prose suffix",
      source: `${action("example")} 不是动作`,
      disposition: "literal",
    },
    { name: "list item", source: `- ${action("list")}`, disposition: "literal" },
    { name: "blockquote", source: `> ${action("quote")}`, disposition: "literal" },
  ])("classifies $name by standalone block boundaries", ({ source, disposition }) => {
    const [occurrence] = analyzeFylloActionMarkdown(source).occurrences;
    expect(occurrence.disposition).toBe(disposition);
    expect(source.slice(occurrence.start, occurrence.end)).toBe(occurrence.raw);
  });

  it.each([
    {
      name: "inline code",
      source: `\`${action("inline")}\``,
      context: "inline_code",
    },
    {
      name: "unclosed inline code",
      source: `\`<fyllo-action type="task.create">{"title":"inline"}`,
      context: "inline_code",
    },
    {
      name: "backtick fence",
      source: `\`\`\`text\n${action("fenced")}\n\`\`\``,
      context: "fenced_code",
    },
    {
      name: "tilde fence",
      source: `~~~text\n${action("fenced")}\n~~~`,
      context: "fenced_code",
    },
  ])("keeps $name literal", ({ source, context }) => {
    const [occurrence] = analyzeFylloActionMarkdown(source).occurrences;
    expect(occurrence).toMatchObject({ disposition: "literal", context });
  });

  it("supports multiline bodies and CRLF block boundaries", () => {
    const source = [
      "Intro",
      "",
      '<fyllo-action type="knowledge.flag">',
      "{",
      '  "summary": "Remember this."',
      "}",
      "</fyllo-action>",
      "",
      "Outro",
    ].join("\r\n");

    const [occurrence] = analyzeFylloActionMarkdown(source).occurrences;
    expect(occurrence).toMatchObject({
      disposition: "candidate",
      closed: true,
      attrs: { type: "knowledge.flag" },
      sourceOrdinal: 0,
    });
    expect(occurrence.body).toContain('"summary": "Remember this."');
  });

  it("keeps final or streaming unclosed occurrences literal", () => {
    const source = '<fyllo-action type="task.create">{"title":"streaming"}';
    const [occurrence] = analyzeFylloActionMarkdown(source).occurrences;

    expect(occurrence).toMatchObject({
      closed: false,
      disposition: "literal",
      context: "markdown",
      end: source.length,
    });
  });

  it("ignores longer HTML-like tag names that only share the public prefix", () => {
    expect(
      analyzeFylloActionMarkdown("<fyllo-actionable>not an action</fyllo-actionable>").occurrences
    ).toEqual([]);
  });

  it("preserves source ordinals across literal and duplicate candidates", () => {
    const literal = `示例：\`${action("same")}\``;
    const source = [literal, action("same"), action("same")].join("\n\n");
    const analysis = analyzeFylloActionMarkdown(source);

    expect(analysis.occurrences.map(({ disposition }) => disposition)).toEqual([
      "literal",
      "candidate",
      "candidate",
    ]);
    expect(analysis.occurrences.map(({ sourceOrdinal }) => sourceOrdinal)).toEqual([0, 1, 2]);
    for (const occurrence of analysis.occurrences) {
      expect(source.slice(occurrence.start, occurrence.end)).toBe(occurrence.raw);
    }
  });
});

describe("parseFylloActionNode", () => {
  it("returns pending for loading node", () => {
    const result = parseFylloActionNode({ attrs: { type: "task.create" }, loading: true });
    expect(result.status).toBe("pending");
  });

  it("returns ready for valid action", () => {
    const result = parseFylloActionNode({
      attrs: { type: "task.create" },
      content: '{"title":"x"}',
      loading: false,
    });
    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.type).toBe("task.create");
      expect(result.payload).toEqual({ title: "x" });
    }
  });

  it("returns invalid for missing type", () => {
    const result = parseFylloActionNode({ content: '{"title":"x"}', loading: false });
    expect(result.status).toBe("invalid");
    if (result.status === "invalid") {
      expect(result.error.code).toBe("missing_type");
    }
  });

  it("returns invalid for unknown type", () => {
    const result = parseFylloActionNode({
      attrs: { type: "task.delete" },
      content: '{"title":"x"}',
      loading: false,
    });
    expect(result.status).toBe("invalid");
    if (result.status === "invalid") {
      expect(result.error.code).toBe("unknown_type");
    }
  });

  it("returns invalid for unexpected attribute", () => {
    const result = parseFylloActionNode({
      attrs: { type: "task.create", version: "1" },
      content: '{"title":"x"}',
      loading: false,
    });
    expect(result.status).toBe("invalid");
    if (result.status === "invalid") {
      expect(result.error.code).toBe("unexpected_attribute");
    }
  });

  it("returns invalid for invalid json", () => {
    const result = parseFylloActionNode({
      attrs: { type: "task.create" },
      content: "not json",
      loading: false,
    });
    expect(result.status).toBe("invalid");
    if (result.status === "invalid") {
      expect(result.error.code).toBe("invalid_json");
    }
  });

  it("returns invalid for payload schema violation", () => {
    const result = parseFylloActionNode({
      attrs: { type: "task.create" },
      content: "{}",
      loading: false,
    });
    expect(result.status).toBe("invalid");
    if (result.status === "invalid") {
      expect(result.error.code).toBe("invalid_payload");
    }
  });
});
