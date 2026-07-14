import { describe, expect, it } from "vitest";
import { collectFylloActionSources, parseFylloActionNode } from "@shared/fyllo-action/parser";

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
