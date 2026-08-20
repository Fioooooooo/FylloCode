import { describe, expect, it } from "vitest";
import type { DynamicToolUIPart } from "ai";
import {
  getToolIcon,
  getToolDiffs,
  getToolError,
  getToolInput,
  getToolKind,
  getToolLocations,
  getToolOutput,
  getToolStatus,
  getToolStatusPresentation,
  getToolStatusText,
  getToolText,
  type ChatToolPart,
} from "@renderer/utils/chatTool";

function tool(toolKind?: string): DynamicToolUIPart {
  return {
    type: "dynamic-tool",
    toolCallId: `tool-${toolKind ?? "none"}`,
    toolName: "Tool",
    state: "input-available",
    input: {},
    ...(toolKind === undefined ? {} : { toolMetadata: { toolKind } }),
  };
}

function outputTool(output: unknown, toolKind?: string): DynamicToolUIPart {
  return {
    type: "dynamic-tool",
    toolCallId: `output-tool-${toolKind ?? "none"}`,
    toolName: "Tool",
    state: "output-available",
    input: {},
    output,
    ...(toolKind === undefined ? {} : { toolMetadata: { toolKind } }),
  };
}

function staticTool(input: unknown, output?: unknown): ChatToolPart {
  return {
    type: "tool-demo",
    toolCallId: "static-tool",
    state: output === undefined ? "input-available" : "output-available",
    input,
    ...(output === undefined ? {} : { output }),
  } as ChatToolPart;
}

describe("chatTool", () => {
  it("recognizes ACP 1.3.0 kinds and preserves the legacy write kind", () => {
    expect(
      ["delete", "move", "think", "fetch", "switch_mode"].map((kind) => getToolKind(tool(kind)))
    ).toEqual(["delete", "move", "think", "fetch", "switch_mode"]);
    expect(getToolKind(tool("write"))).toBe("write");
    expect(getToolKind(tool())).toBe("other");
  });

  it("falls back to other for unknown or empty tool kinds", () => {
    expect(getToolKind(tool("unknown"))).toBe("other");
    expect(getToolKind(tool(""))).toBe("other");
  });

  it("returns icons for known and fallback tool kinds", () => {
    expect(getToolIcon(tool("read"))).toBe("i-lucide-file-text");
    expect(getToolIcon(tool("write"))).toBe("i-lucide-file-plus");
    expect(getToolIcon(tool("edit"))).toBe("i-lucide-pencil");
    expect(getToolIcon(tool("delete"))).toBe("i-lucide-trash-2");
    expect(getToolIcon(tool("move"))).toBe("i-lucide-move");
    expect(getToolIcon(tool("search"))).toBe("i-lucide-search");
    expect(getToolIcon(tool("execute"))).toBe("i-lucide-square-terminal");
    expect(getToolIcon(tool("think"))).toBe("i-lucide-brain");
    expect(getToolIcon(tool("fetch"))).toBe("i-lucide-cloud-download");
    expect(getToolIcon(tool("switch_mode"))).toBe("i-lucide-repeat-2");
    expect(getToolIcon(tool("unknown"))).toBe("i-lucide-wrench");
  });

  it("uses the ACP title as the tool display text", () => {
    const part = {
      ...tool("execute"),
      toolName: "Bash",
      title: "Run pnpm typecheck",
      input: { command: "pnpm typecheck", description: "Type-check the project" },
    } satisfies DynamicToolUIPart;

    expect(getToolText(part)).toBe("Run pnpm typecheck");
  });

  it("formats dynamic and static tool inputs", () => {
    expect(
      getToolInput({
        ...tool("execute"),
        input: { command: "pnpm test", options: ["--run"], retry: false },
      })
    ).toBe('{\n  "command": "pnpm test",\n  "options": [\n    "--run"\n  ],\n  "retry": false\n}');
    expect(getToolInput(staticTool("raw input"))).toBe("raw input");
  });

  it("omits missing and empty tool inputs", () => {
    expect(getToolInput(tool("read"))).toBeNull();
    expect(
      getToolInput({
        type: "dynamic-tool",
        toolCallId: "streaming-input",
        toolName: "Tool",
        state: "input-streaming",
      })
    ).toBeNull();
  });

  it("formats final dynamic and static outputs", () => {
    expect(getToolOutput(outputTool({ files: 2, cached: true }, "read"))).toBe(
      '{\n  "files": 2,\n  "cached": true\n}'
    );
    expect(getToolOutput(staticTool({ query: "status" }, "done"))).toBe("done");
  });

  it("uses live output until the final output becomes available", () => {
    const livePart = {
      ...tool("execute"),
      toolMetadata: { toolKind: "execute", liveOutput: "checking...\n" },
    } satisfies DynamicToolUIPart;
    const finalPart = {
      type: "dynamic-tool",
      toolCallId: livePart.toolCallId,
      toolName: livePart.toolName,
      state: "output-available",
      input: {},
      output: "complete\n",
      toolMetadata: { toolKind: "execute", liveOutput: "checking...\n" },
    } satisfies DynamicToolUIPart;

    expect(getToolOutput(livePart)).toBe("checking...\n");
    expect(getToolOutput(finalPart)).toBe("complete\n");
  });

  it("reads all ACP statuses and falls back from legacy AI states", () => {
    for (const [status, text] of [
      ["pending", "等待执行"],
      ["in_progress", "正在执行"],
      ["completed", "已完成"],
      ["failed", "失败"],
    ] as const) {
      const part = {
        ...tool("other"),
        toolMetadata: { acpStatus: status },
      } satisfies DynamicToolUIPart;
      expect(getToolStatus(part)).toBe(status);
      expect(getToolStatusText(part)).toBe(text);
      expect(getToolStatusPresentation(part)).toEqual({
        text,
        visible: status === "failed",
        ...(status === "failed" ? { leadingIconClass: "text-error" } : {}),
      });
    }

    expect(getToolStatus(tool())).toBe("in_progress");
    expect(getToolStatus(outputTool("done"))).toBe("completed");
    expect(
      getToolStatus({
        type: "dynamic-tool",
        toolCallId: "failed",
        toolName: "Tool",
        state: "output-error",
        input: {},
        errorText: "failed",
      })
    ).toBe("failed");
  });

  it("safely reads errors, diff and locations while filtering malformed metadata", () => {
    const part = {
      type: "dynamic-tool",
      toolCallId: "edit",
      toolName: "Edit",
      state: "output-error",
      input: {},
      errorText: "permission denied",
      toolMetadata: {
        diff: [
          { path: "/a.ts", oldText: "old", newText: "new" },
          { path: "/new.ts", newText: "created" },
          { path: 42, newText: "invalid" },
        ],
        locations: [
          { path: "/a.ts", line: 4 },
          { path: "/new.ts" },
          { path: "relative.ts", line: "bad" },
        ],
      },
    } as DynamicToolUIPart;

    expect(getToolError(part)).toBe("permission denied");
    expect(getToolDiffs(part)).toEqual([
      { path: "/a.ts", oldText: "old", newText: "new" },
      { path: "/new.ts", newText: "created" },
    ]);
    expect(getToolLocations(part)).toEqual([{ path: "/a.ts", line: 4 }, { path: "/new.ts" }]);
    expect(getToolDiffs({ ...tool(), toolMetadata: { diff: "invalid" } })).toEqual([]);
    expect(getToolLocations({ ...tool(), toolMetadata: { locations: null } })).toEqual([]);
  });
});
