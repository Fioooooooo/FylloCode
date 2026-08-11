import type { DynamicToolUIPart } from "ai";
import { describe, expect, it } from "vitest";
import { getToolCallMessageMetadata, reduceToolCallPart } from "@shared/chat/tool-call-assembly";

function start(overrides: Partial<Parameters<typeof reduceToolCallPart>[0]["event"]> = {}) {
  return reduceToolCallPart({
    previous: null,
    event: {
      kind: "tool_call_start",
      toolCallId: "tool-1",
      toolName: "shell",
      title: "Run command",
      toolKind: "execute",
      status: "pending",
      ...overrides,
    } as Extract<Parameters<typeof reduceToolCallPart>[0]["event"], { kind: "tool_call_start" }>,
  });
}

describe("reduceToolCallPart", () => {
  it("maps pending starts to input-streaming", () => {
    const result = start({
      diff: [{ path: "/a.ts", oldText: "old", newText: "new" }],
      locations: [{ path: "/a.ts", line: 4 }],
    });

    expect(result.part.state).toBe("input-streaming");
    expect(getToolCallMessageMetadata(result.part)).toMatchObject({
      acpStatus: "pending",
      toolKind: "execute",
      diff: [{ path: "/a.ts", oldText: "old", newText: "new" }],
      locations: [{ path: "/a.ts", line: 4 }],
    });
    expect(result.changed).toBe(true);
    expect(result.terminal).toBe(false);
  });

  it("preserves status and replacement collections when fields are omitted", () => {
    const initial = start({
      diff: [{ path: "/a.ts", oldText: "old", newText: "new" }],
      locations: [{ path: "/a.ts", line: 4 }],
    });
    const result = reduceToolCallPart({
      previous: initial.part,
      event: { kind: "tool_call_update", toolCallId: "tool-1", title: "Still waiting" },
      accumulatedOutput: initial.accumulatedOutput,
    });

    expect(getToolCallMessageMetadata(result.part)).toMatchObject({
      acpStatus: "pending",
      diff: [{ path: "/a.ts", oldText: "old", newText: "new" }],
      locations: [{ path: "/a.ts", line: 4 }],
    });
  });

  it("falls back orphan updates without status to in-progress", () => {
    const result = reduceToolCallPart({
      previous: null,
      event: { kind: "tool_call_update", toolCallId: "orphan", title: "Running" },
    });

    expect(result.part.state).toBe("input-available");
    expect(getToolCallMessageMetadata(result.part).acpStatus).toBe("in_progress");
  });

  it("replaces and explicitly clears diff and locations", () => {
    const initial = start({
      diff: [{ path: "/a.ts", oldText: "old", newText: "new" }],
      locations: [{ path: "/a.ts", line: 4 }],
    });
    const replaced = reduceToolCallPart({
      previous: initial.part,
      event: {
        kind: "tool_call_update",
        toolCallId: "tool-1",
        diff: [{ path: "/b.ts", newText: "created" }],
        locations: [{ path: "/b.ts" }],
      },
    });
    const cleared = reduceToolCallPart({
      previous: replaced.part,
      event: {
        kind: "tool_call_update",
        toolCallId: "tool-1",
        diff: [],
        locations: [],
      },
    });

    expect(getToolCallMessageMetadata(replaced.part)).toMatchObject({
      diff: [{ path: "/b.ts", newText: "created" }],
      locations: [{ path: "/b.ts" }],
    });
    expect(getToolCallMessageMetadata(cleared.part).diff).toBeUndefined();
    expect(getToolCallMessageMetadata(cleared.part).locations).toBeUndefined();
  });

  it("accumulates output and maps completed to output-available", () => {
    const initial = start({ status: "in_progress" });
    const streaming = reduceToolCallPart({
      previous: initial.part,
      event: {
        kind: "tool_call_update",
        toolCallId: "tool-1",
        outputDelta: "first\n",
      },
    });
    const completed = reduceToolCallPart({
      previous: streaming.part,
      event: {
        kind: "tool_call_update",
        toolCallId: "tool-1",
        status: "completed",
        outputDelta: "second\n",
      },
      accumulatedOutput: streaming.accumulatedOutput,
    });

    expect(streaming.accumulatedOutput).toBe("first\n");
    expect(completed.part).toMatchObject({
      state: "output-available",
      output: "first\nsecond\n",
    });
    expect(completed.accumulatedOutput).toBe("");
    expect(completed.terminal).toBe(true);
  });

  it("maps failed to output-error", () => {
    const initial = start({ status: "in_progress" });
    const failed = reduceToolCallPart({
      previous: initial.part,
      event: {
        kind: "tool_call_update",
        toolCallId: "tool-1",
        status: "failed",
        content: "Permission denied",
      },
    });

    expect(failed.part).toMatchObject({
      state: "output-error",
      errorText: "Permission denied",
    });
    expect(getToolCallMessageMetadata(failed.part).acpStatus).toBe("failed");
  });

  it("merges delayed parent and subagent fields without clearing old summary values", () => {
    const initial = start({
      status: "in_progress",
      subagent: { agentType: "Explore", toolStats: { readCount: 1 } },
    });
    const updated = reduceToolCallPart({
      previous: initial.part,
      event: {
        kind: "tool_call_update",
        toolCallId: "tool-1",
        parentToolCallId: "parent",
        subagent: { totalTokens: 42, toolStats: { searchCount: 2 } },
      },
    });

    expect(getToolCallMessageMetadata(updated.part)).toMatchObject({
      parentToolCallId: "parent",
      subagent: {
        agentType: "Explore",
        totalTokens: 42,
        toolStats: { readCount: 1, searchCount: 2 },
      },
    });
  });

  it("reports an update with no effective changes as unchanged", () => {
    const initial = start({ status: "in_progress" });
    const result = reduceToolCallPart({
      previous: initial.part as DynamicToolUIPart,
      event: { kind: "tool_call_update", toolCallId: "tool-1" },
    });

    expect(result.changed).toBe(false);
    expect(result.part).toEqual(initial.part);
  });
});
