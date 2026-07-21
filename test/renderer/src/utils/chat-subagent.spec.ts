import { describe, expect, it } from "vitest";
import type { DynamicToolUIPart, UIMessage } from "ai";
import {
  formatSubagentDuration,
  formatSubagentTokens,
  getSubagentToolStatRows,
  projectSubagentCalls,
  resolveSubagentDisplayState,
} from "@renderer/utils/chatSubagent";

function tool(
  toolCallId: string,
  options: {
    parentToolCallId?: string;
    subagent?: Record<string, unknown>;
    state?: DynamicToolUIPart["state"];
  } = {}
): DynamicToolUIPart {
  const toolMetadata: Record<string, unknown> = {};
  if (options.parentToolCallId) toolMetadata.parentToolCallId = options.parentToolCallId;
  if (options.subagent !== undefined) toolMetadata.subagent = options.subagent;
  return {
    type: "dynamic-tool",
    toolCallId,
    toolName: "Tool",
    state: options.state ?? "input-available",
    input: {},
    ...(Object.keys(toolMetadata).length > 0 ? { toolMetadata } : {}),
  } as DynamicToolUIPart;
}

function parts(...items: UIMessage["parts"]): UIMessage["parts"] {
  return items;
}

describe("projectSubagentCalls", () => {
  it("projects an explicit marker even before child tools arrive", () => {
    const projection = projectSubagentCalls(parts(tool("parent", { subagent: {} })));

    expect(projection.roots).toHaveLength(1);
    expect(projection.roots[0]?.root.part.toolCallId).toBe("parent");
    expect(projection.roots[0]?.descendants).toEqual([]);
    expect(projection.hiddenPartIndexes.size).toBe(0);
  });

  it("projects relation-only historical messages and preserves non-consecutive order", () => {
    const projection = projectSubagentCalls(
      parts(
        tool("parent"),
        tool("child-1", { parentToolCallId: "parent" }),
        { type: "text", text: "between" },
        tool("child-2", { parentToolCallId: "parent" })
      )
    );

    expect(projection.roots.map((root) => root.root.part.toolCallId)).toEqual(["parent"]);
    expect(projection.roots[0]?.descendants.map((entry) => entry.part.toolCallId)).toEqual([
      "child-1",
      "child-2",
    ]);
    expect([...projection.hiddenPartIndexes]).toEqual([1, 3]);
  });

  it("keeps parallel and nested subagent trees isolated with depth", () => {
    const projection = projectSubagentCalls(
      parts(
        tool("root-a", { subagent: {} }),
        tool("root-b", { subagent: {} }),
        tool("nested", { parentToolCallId: "root-a", subagent: {} }),
        tool("b-child", { parentToolCallId: "root-b" }),
        tool("nested-child", { parentToolCallId: "nested" }),
        tool("a-child", { parentToolCallId: "root-a" })
      )
    );

    expect(projection.roots.map((root) => root.root.part.toolCallId)).toEqual(["root-a", "root-b"]);
    expect(
      projection.roots[0]?.descendants.map((entry) => [entry.part.toolCallId, entry.depth])
    ).toEqual([
      ["nested", 1],
      ["nested-child", 2],
      ["a-child", 1],
    ]);
    expect(
      projection.roots[1]?.descendants.map((entry) => [entry.part.toolCallId, entry.depth])
    ).toEqual([["b-child", 1]]);
  });

  it("leaves orphan, self-linked, cyclic and duplicate IDs visible as ordinary tools", () => {
    const projection = projectSubagentCalls(
      parts(
        tool("orphan", { parentToolCallId: "missing" }),
        tool("self", { parentToolCallId: "self" }),
        tool("cycle-a", { parentToolCallId: "cycle-b", subagent: {} }),
        tool("cycle-b", { parentToolCallId: "cycle-a" }),
        tool("duplicate", { subagent: {} }),
        tool("duplicate")
      )
    );

    expect(projection.roots).toEqual([]);
    expect(projection.hiddenPartIndexes.size).toBe(0);
  });

  it("attaches a delayed relationship once the metadata appears", () => {
    const child = tool("child");
    expect(projectSubagentCalls(parts(tool("parent"), child)).roots).toEqual([]);

    child.toolMetadata = { parentToolCallId: "parent" };
    const projection = projectSubagentCalls(parts(tool("parent"), child));
    expect(projection.roots[0]?.descendants[0]?.part.toolCallId).toBe("child");
  });
});

describe("subagent display formatting", () => {
  it("resolves running, completed, failed and interrupted states", () => {
    expect(resolveSubagentDisplayState(tool("running", { subagent: {} }), true)).toBe("running");
    expect(resolveSubagentDisplayState(tool("interrupted", { subagent: {} }), false)).toBe(
      "interrupted"
    );
    expect(
      resolveSubagentDisplayState(tool("completed", { subagent: { status: "completed" } }), false)
    ).toBe("completed");
    expect(
      resolveSubagentDisplayState(tool("failed", { subagent: { status: "failed" } }), false)
    ).toBe("failed");
    expect(resolveSubagentDisplayState(tool("legacy", { state: "output-available" }), false)).toBe(
      "completed"
    );
  });

  it("formats upstream metrics without inferring missing values", () => {
    expect(formatSubagentTokens(undefined)).toBe("—");
    expect(formatSubagentTokens(37556)).toBe("37,556");
    expect(formatSubagentDuration(undefined)).toBe("—");
    expect(formatSubagentDuration(28471)).toBe("28.5 秒");
    expect(formatSubagentDuration(125000)).toBe("2 分 05 秒");
  });

  it("preserves zero-valued tool statistics", () => {
    expect(getSubagentToolStatRows({ readCount: 0, bashCount: 5 })).toEqual([
      { key: "readCount", label: "读取", value: 0 },
      { key: "bashCount", label: "Bash", value: 5 },
    ]);
    expect(getSubagentToolStatRows(undefined)).toEqual([]);
  });
});
