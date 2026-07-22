import { describe, expect, it } from "vitest";
import type { DynamicToolUIPart, UIMessage } from "ai";
import {
  getActivityGroupIcon,
  projectAssistantRenderItems,
  summarizeActivityGroup,
  type AssistantActivityEntry,
} from "@renderer/utils/chatAssistant";
import { projectSubagentCalls } from "@renderer/utils/chatSubagent";

type MessagePart = UIMessage["parts"][number];

function reasoning(text: string, state: "streaming" | "done" = "done"): MessagePart {
  return { type: "reasoning", text, state };
}

function tool(
  toolCallId: string,
  toolKind?: string,
  metadata: Record<string, unknown> = {}
): DynamicToolUIPart {
  return {
    type: "dynamic-tool",
    toolCallId,
    toolName: "Tool",
    state: "input-available",
    input: {},
    toolMetadata: { ...(toolKind === undefined ? {} : { toolKind }), ...metadata },
  };
}

function project(parts: UIMessage["parts"]) {
  return projectAssistantRenderItems("message-1", parts, projectSubagentCalls(parts));
}

function entries(parts: MessagePart[]): AssistantActivityEntry[] {
  return parts.map((part, partIndex) => ({
    part: part as AssistantActivityEntry["part"],
    partIndex,
  }));
}

describe("chatAssistant", () => {
  it("groups a mixed ReAct run and keeps following text in place", () => {
    const items = project([
      reasoning("first"),
      tool("read", "read"),
      reasoning("second"),
      tool("write", "write"),
      { type: "text", text: "answer" },
    ]);

    expect(items.map((item) => item.kind)).toEqual(["activity-group", "part"]);
    const group = items[0];
    expect(group.kind).toBe("activity-group");
    if (group.kind !== "activity-group") return;
    expect(group.activities.map((entry) => entry.partIndex)).toEqual([0, 1, 2, 3]);
    expect(items[1]).toMatchObject({ kind: "part", partIndex: 4 });
  });

  it("groups tool-first, tool-only, and reasoning-only runs", () => {
    expect(project([tool("read", "read"), reasoning("after")])[0]?.kind).toBe("activity-group");
    expect(project([tool("read", "read"), tool("write", "write")])[0]?.kind).toBe("activity-group");
    expect(project([reasoning("first"), reasoning("second")])[0]?.kind).toBe("activity-group");
  });

  it("keeps single tools and reasoning parts ungrouped", () => {
    expect(project([tool("read", "read")])).toMatchObject([{ kind: "part", partIndex: 0 }]);
    expect(project([reasoning("single")])).toMatchObject([{ kind: "part", partIndex: 0 }]);
  });

  it("uses text as a boundary between activity groups", () => {
    const items = project([
      reasoning("left"),
      tool("read", "read"),
      { type: "text", text: "between" },
      tool("write", "write"),
      reasoning("right"),
    ]);

    expect(items.map((item) => item.kind)).toEqual(["activity-group", "part", "activity-group"]);
  });

  it("keeps consecutive subagent roots as independent cards", () => {
    const items = project([
      tool("parent-1", undefined, { subagent: { status: "in_progress" } }),
      tool("parent-2", undefined, { subagent: { status: "in_progress" } }),
    ]);

    expect(items.map((item) => item.kind)).toEqual(["subagent-call", "subagent-call"]);
  });

  it("skips hidden descendants without breaking the visible activity run", () => {
    const items = project([
      tool("parent", undefined, { subagent: { status: "in_progress" } }),
      reasoning("visible reasoning"),
      tool("child", "read", { parentToolCallId: "parent" }),
      tool("ordinary", "write"),
    ]);

    expect(items.map((item) => item.kind)).toEqual(["subagent-call", "activity-group"]);
    const group = items[1];
    expect(group.kind).toBe("activity-group");
    if (group.kind !== "activity-group") return;
    expect(group.activities.map((entry) => entry.partIndex)).toEqual([1, 3]);
  });

  it("summarizes activity kinds in first-appearance order", () => {
    const activityEntries = entries([
      tool("write-1", "write"),
      reasoning("think"),
      tool("write-2", "write"),
      tool("read", "read"),
      tool("unknown"),
    ]);

    expect(summarizeActivityGroup(activityEntries)).toBe(
      "Write 2 files, Think 1 time, Read 1 file, Run 1 tool"
    );
    expect(summarizeActivityGroup(entries([reasoning("one"), reasoning("two")]))).toBe(
      "Think 2 times"
    );
  });

  it("keeps the last tool icon when trailing reasoning is streaming", () => {
    const activityEntries = entries([tool("read", "read"), reasoning("thinking", "streaming")]);

    expect(getActivityGroupIcon(activityEntries, (entry) => entry.partIndex === 1)).toBe(
      "i-lucide-file-text"
    );
  });

  it("uses the last streaming tool before the last historical tool", () => {
    const activityEntries = entries([
      tool("read", "read"),
      reasoning("thinking", "streaming"),
      tool("write", "write"),
      tool("search", "search"),
    ]);

    expect(getActivityGroupIcon(activityEntries, (entry) => entry.partIndex <= 2)).toBe(
      "i-lucide-file-plus"
    );
    expect(getActivityGroupIcon(activityEntries, () => false)).toBe("i-lucide-search");
  });

  it("uses the brain only for pure reasoning groups and a wrench for empty groups", () => {
    expect(
      getActivityGroupIcon(entries([reasoning("one"), reasoning("two", "streaming")]), () => true)
    ).toBe("i-lucide-brain");
    expect(getActivityGroupIcon([], () => false)).toBe("i-lucide-wrench");
  });

  it("keeps an activity group key stable when the run appends entries", () => {
    const initial = project([reasoning("first"), tool("read", "read")]);
    const appended = project([reasoning("first"), tool("read", "read"), reasoning("second")]);

    expect(initial[0]?.key).toBe("message-1-activity-group-0");
    expect(appended[0]?.key).toBe(initial[0]?.key);
  });
});
