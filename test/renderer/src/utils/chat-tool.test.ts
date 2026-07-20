import { describe, expect, it } from "vitest";
import type { DynamicToolUIPart } from "ai";
import {
  getToolGroupIcon,
  getToolIcon,
  getToolKind,
  getToolOutput,
  getToolText,
  summarizeToolGroup,
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

describe("chatTool", () => {
  it("summarizes read and write tool groups", () => {
    expect(summarizeToolGroup([tool("read"), tool("write")])).toBe("Read 1 file, Write 1 file");
  });

  it("summarizes missing metadata as run tools", () => {
    expect(summarizeToolGroup([tool(), tool()])).toBe("Run 2 tools");
  });

  it("summarizes mixed known and fallback kinds", () => {
    expect(summarizeToolGroup([tool("read"), tool(), tool("read")])).toBe(
      "Read 2 files, Run 1 tool"
    );
  });

  it("falls back to other for unknown or empty tool kinds", () => {
    expect(getToolKind(tool("unknown"))).toBe("other");
    expect(getToolKind(tool(""))).toBe("other");
  });

  it("orders summary groups by first appearance", () => {
    expect(summarizeToolGroup([tool("write"), tool("read"), tool("write")])).toBe(
      "Write 2 files, Read 1 file"
    );
  });

  it("returns icons for known and fallback tool kinds", () => {
    expect(getToolIcon(tool("read"))).toBe("i-lucide-file-text");
    expect(getToolIcon(tool("write"))).toBe("i-lucide-file-plus");
    expect(getToolIcon(tool("edit"))).toBe("i-lucide-pencil");
    expect(getToolIcon(tool("search"))).toBe("i-lucide-search");
    expect(getToolIcon(tool("execute"))).toBe("i-lucide-square-terminal");
    expect(getToolIcon(tool("unknown"))).toBe("i-lucide-wrench");
  });

  it("uses the last streaming tool icon for a group", () => {
    const read = tool("read");
    const write = tool("write");
    const edit = tool("edit");

    expect(getToolGroupIcon([read, write, edit], (part) => part === read || part === write)).toBe(
      "i-lucide-file-plus"
    );
  });

  it("uses the last tool icon when no group tool is streaming", () => {
    expect(getToolGroupIcon([tool("read"), tool("write")], () => false)).toBe("i-lucide-file-plus");
    expect(getToolGroupIcon([], () => false)).toBe("i-lucide-wrench");
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

  it("returns live output while a tool is still streaming", () => {
    const part = {
      ...tool("execute"),
      toolMetadata: { toolKind: "execute", liveOutput: "checking...\n" },
    } satisfies DynamicToolUIPart;

    expect(getToolOutput(part)).toBe("checking...\n");
  });
});
