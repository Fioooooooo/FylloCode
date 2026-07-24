import { describe, expect, it } from "vitest";
import { analyzeFylloSignalMarkdown, parseFylloSignalNode } from "@shared/fyllo-signal/parser";

describe("analyzeFylloSignalMarkdown", () => {
  it("keeps an unclosed occurrence structural and literal without a pending state", () => {
    const source = '<fyllo-signal type="show.time">{"label":"streaming"}';
    const [occurrence] = analyzeFylloSignalMarkdown(source).occurrences;

    expect(occurrence).toMatchObject({
      raw: source,
      closed: false,
      disposition: "literal",
      context: "markdown",
    });
  });
});

describe("parseFylloSignalNode", () => {
  it.each([
    {
      name: "missing type",
      node: { content: '{"label":"now"}' },
      code: "missing_type",
    },
    {
      name: "invalid type name",
      node: { attrs: { type: "Show Time" }, content: '{"label":"now"}' },
      code: "invalid_type_name",
    },
    {
      name: "unknown type",
      node: { attrs: { type: "show.weather" }, content: '{"label":"now"}' },
      code: "unknown_type",
    },
    {
      name: "extra attribute",
      node: { attrs: { type: "show.time", version: "1" }, content: '{"label":"now"}' },
      code: "unexpected_attribute",
    },
    {
      name: "invalid JSON",
      node: { attrs: { type: "show.time" }, content: "not JSON" },
      code: "invalid_json",
    },
    {
      name: "invalid payload",
      node: { attrs: { type: "show.time" }, content: "{}" },
      code: "invalid_payload",
    },
  ])("returns $code for $name", ({ node, code }) => {
    const result = parseFylloSignalNode(node);
    expect(result.status).toBe("invalid");
    if (result.status === "invalid") {
      expect(result.error.code).toBe(code);
    }
  });

  it("returns a typed ready payload", () => {
    expect(
      parseFylloSignalNode({
        attrs: [["type", "show.time"]],
        content: '{"label":"2026-07-24 10:30"}',
      })
    ).toEqual({
      status: "ready",
      type: "show.time",
      payload: { label: "2026-07-24 10:30" },
    });
  });
});
