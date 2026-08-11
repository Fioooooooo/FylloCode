import type { DynamicToolUIPart } from "ai";
import type { ToolCallStreamEvent } from "@shared/chat/tool-call-assembly";

export const TOOL_CALL_EVENT_FIXTURE: ToolCallStreamEvent[] = [
  {
    kind: "tool_call_start",
    toolCallId: "edit-1",
    toolName: "Edit",
    title: "Edit file",
    toolKind: "edit",
    status: "pending",
    input: { path: "/a.ts" },
    diff: [{ path: "/a.ts", oldText: "old", newText: "draft" }],
    locations: [{ path: "/a.ts", line: 2 }],
  },
  { kind: "tool_call_update", toolCallId: "edit-1", status: "in_progress" },
  { kind: "tool_call_update", toolCallId: "edit-1", diff: [], locations: [] },
  { kind: "tool_call_update", toolCallId: "edit-1", outputDelta: "working" },
  {
    kind: "tool_call_update",
    toolCallId: "edit-1",
    status: "completed",
    content: "done",
    diff: [{ path: "/b.ts", newText: "created" }],
    locations: [{ path: "/b.ts" }],
    parentToolCallId: "parent-1",
    subagent: { status: "completed", toolStats: { editFileCount: 1 } },
  },
  {
    kind: "tool_call_update",
    toolCallId: "failed-1",
    status: "failed",
    title: "Run command",
    toolKind: "execute",
    content: "permission denied",
  },
];

export const TOOL_CALL_EVENT_EXPECTED_PARTS: DynamicToolUIPart[] = [
  {
    type: "dynamic-tool",
    toolCallId: "edit-1",
    toolName: "Edit",
    title: "Edit file",
    state: "output-available",
    input: { path: "/a.ts" },
    output: "done",
    toolMetadata: {
      toolKind: "edit",
      acpStatus: "completed",
      diff: [{ path: "/b.ts", newText: "created" }],
      locations: [{ path: "/b.ts" }],
      parentToolCallId: "parent-1",
      subagent: { status: "completed", toolStats: { editFileCount: 1 } },
    },
  },
  {
    type: "dynamic-tool",
    toolCallId: "failed-1",
    toolName: "Run command",
    title: "Run command",
    state: "output-error",
    input: {},
    errorText: "permission denied",
    toolMetadata: { toolKind: "execute", acpStatus: "failed" },
  },
];
