import { describe, expect, it } from "vitest";
import type { DynamicToolUIPart } from "ai";
import {
  getToolIcon,
  getToolInput,
  getToolKind,
  getToolOutput,
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
  it("falls back to other for unknown or empty tool kinds", () => {
    expect(getToolKind(tool("unknown"))).toBe("other");
    expect(getToolKind(tool(""))).toBe("other");
  });

  it("returns icons for known and fallback tool kinds", () => {
    expect(getToolIcon(tool("read"))).toBe("i-lucide-file-text");
    expect(getToolIcon(tool("write"))).toBe("i-lucide-file-plus");
    expect(getToolIcon(tool("edit"))).toBe("i-lucide-pencil");
    expect(getToolIcon(tool("search"))).toBe("i-lucide-search");
    expect(getToolIcon(tool("execute"))).toBe("i-lucide-square-terminal");
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
});
