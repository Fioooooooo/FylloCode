import type { DynamicToolUIPart } from "ai";
import type {
  StreamContentEvent,
  SubagentRunSummary,
  ToolCallDiff,
  ToolCallLocation,
  ToolCallStatus,
} from "../types/stream-event";

export type ToolCallStreamEvent = Extract<
  StreamContentEvent,
  { kind: "tool_call_start" | "tool_call_update" }
>;

export interface ToolCallMessageMetadata {
  toolKind?: string;
  acpStatus?: ToolCallStatus;
  diff?: ToolCallDiff[];
  locations?: ToolCallLocation[];
  parentToolCallId?: string;
  subagent?: SubagentRunSummary;
  liveOutput?: string;
}

export interface ToolCallAssemblyResult {
  part: DynamicToolUIPart;
  accumulatedOutput: string;
  changed: boolean;
  terminal: boolean;
}

function metadataRecord(part: DynamicToolUIPart | null): Record<string, unknown> {
  return part?.toolMetadata && typeof part.toolMetadata === "object"
    ? { ...(part.toolMetadata as Record<string, unknown>) }
    : {};
}

function isToolCallStatus(value: unknown): value is ToolCallStatus {
  return (
    value === "pending" || value === "in_progress" || value === "completed" || value === "failed"
  );
}

function cloneDiffs(value: ToolCallDiff[]): ToolCallDiff[] {
  return value.map((item) => ({ ...item }));
}

function cloneLocations(value: ToolCallLocation[]): ToolCallLocation[] {
  return value.map((item) => ({ ...item }));
}

function mergeSubagent(existing: unknown, incoming: SubagentRunSummary): SubagentRunSummary {
  const previous =
    existing !== null && typeof existing === "object"
      ? (existing as SubagentRunSummary)
      : undefined;
  const merged: SubagentRunSummary = { ...previous, ...incoming };
  if (previous?.toolStats || incoming.toolStats) {
    merged.toolStats = {
      ...previous?.toolStats,
      ...incoming.toolStats,
    };
  }
  return merged;
}

function buildMetadata(
  previous: DynamicToolUIPart | null,
  event: ToolCallStreamEvent,
  status: ToolCallStatus
): DynamicToolUIPart["toolMetadata"] {
  const next = metadataRecord(previous);

  if (
    !(typeof next.toolKind === "string" && next.toolKind.length > 0) &&
    typeof event.toolKind === "string" &&
    event.toolKind.length > 0
  ) {
    next.toolKind = event.toolKind;
  }

  if (
    !(typeof next.parentToolCallId === "string" && next.parentToolCallId.length > 0) &&
    typeof event.parentToolCallId === "string" &&
    event.parentToolCallId.length > 0
  ) {
    next.parentToolCallId = event.parentToolCallId;
  }

  if (event.subagent !== undefined) {
    next.subagent = mergeSubagent(next.subagent, event.subagent);
  }

  if ("diff" in event && event.diff !== undefined) {
    if (event.diff.length === 0) delete next.diff;
    else next.diff = cloneDiffs(event.diff);
  }

  if ("locations" in event && event.locations !== undefined) {
    if (event.locations.length === 0) delete next.locations;
    else next.locations = cloneLocations(event.locations);
  }

  next.acpStatus = status;
  delete next.liveOutput;
  return Object.keys(next).length > 0 ? (next as DynamicToolUIPart["toolMetadata"]) : undefined;
}

function currentStatus(previous: DynamicToolUIPart | null): ToolCallStatus | undefined {
  const value = metadataRecord(previous).acpStatus;
  if (isToolCallStatus(value)) return value;
  if (previous?.state === "input-streaming") return "pending";
  if (previous?.state === "input-available") return "in_progress";
  if (previous?.state === "output-available") return "completed";
  if (previous?.state === "output-error") return "failed";
  return undefined;
}

function partInput(previous: DynamicToolUIPart | null, event: ToolCallStreamEvent): unknown {
  return event.input ?? previous?.input ?? {};
}

function nextTitle(
  previous: DynamicToolUIPart | null,
  event: ToolCallStreamEvent,
  status: ToolCallStatus
): string | undefined {
  const description =
    typeof event.input?.description === "string" ? event.input.description : undefined;
  const contentTitle =
    (typeof previous?.title !== "string" || previous.title.length === 0) &&
    event.kind === "tool_call_update" &&
    status !== "completed" &&
    status !== "failed" &&
    !event.outputDelta
      ? event.content
      : undefined;
  return (
    event.title ??
    description ??
    // 非终态 content 可能只是流式参数片段；已有标题时不得让它覆盖工具标题。
    contentTitle ??
    previous?.title
  );
}

function previousOutput(previous: DynamicToolUIPart | null): unknown {
  return previous?.state === "output-available" ? previous.output : undefined;
}

function previousError(previous: DynamicToolUIPart | null): string | undefined {
  return previous?.state === "output-error" ? previous.errorText : undefined;
}

function samePart(left: DynamicToolUIPart | null, right: DynamicToolUIPart): boolean {
  return left !== null && JSON.stringify(left) === JSON.stringify(right);
}

/**
 * 将单个 ACP 工具事件归并为可持久化的 DynamicToolUIPart。
 * 调用方继续拥有 part 定位、消息生命周期和 Renderer 专属 liveOutput。
 */
export function reduceToolCallPart(input: {
  previous: DynamicToolUIPart | null;
  event: ToolCallStreamEvent;
  accumulatedOutput?: string;
}): ToolCallAssemblyResult {
  const { previous, event } = input;
  const appendedOutput = `${input.accumulatedOutput ?? ""}${
    event.kind === "tool_call_update" ? (event.outputDelta ?? "") : ""
  }`;
  const fallbackStatus: ToolCallStatus =
    event.kind === "tool_call_start" ? "pending" : "in_progress";
  const status = event.status ?? currentStatus(previous) ?? fallbackStatus;
  const toolName = event.toolName ?? previous?.toolName ?? event.title ?? event.toolCallId;
  const title = nextTitle(previous, event, status);
  const metadata = buildMetadata(previous, event, status);
  const common = {
    type: "dynamic-tool" as const,
    toolCallId: event.toolCallId,
    toolName,
    title,
    toolMetadata: metadata,
  };

  let part: DynamicToolUIPart;
  if (status === "pending") {
    part = {
      ...common,
      state: "input-streaming",
      input: partInput(previous, event),
    };
  } else if (status === "in_progress") {
    part = {
      ...common,
      state: "input-available",
      input: partInput(previous, event),
    };
  } else if (status === "completed") {
    const eventOutput = event.kind === "tool_call_update" ? event.content : undefined;
    part = {
      ...common,
      state: "output-available",
      input: partInput(previous, event),
      output:
        eventOutput ??
        (event.kind === "tool_call_update" && event.outputDelta ? appendedOutput : undefined) ??
        previousOutput(previous) ??
        appendedOutput,
    };
  } else {
    const eventError = event.kind === "tool_call_update" ? event.content : undefined;
    part = {
      ...common,
      state: "output-error",
      input: partInput(previous, event),
      errorText:
        eventError ??
        (event.kind === "tool_call_update" && event.outputDelta ? appendedOutput : undefined) ??
        previousError(previous) ??
        appendedOutput ??
        "工具执行失败",
    };
    if (part.errorText.length === 0) part.errorText = "工具执行失败";
  }

  const terminal = status === "completed" || status === "failed";
  return {
    part,
    accumulatedOutput: terminal ? "" : appendedOutput,
    changed: !samePart(previous, part),
    terminal,
  };
}

export function getToolCallMessageMetadata(part: DynamicToolUIPart): ToolCallMessageMetadata {
  const raw = metadataRecord(part);
  return {
    toolKind: typeof raw.toolKind === "string" ? raw.toolKind : undefined,
    acpStatus: isToolCallStatus(raw.acpStatus) ? raw.acpStatus : undefined,
    diff: Array.isArray(raw.diff) ? (raw.diff as ToolCallDiff[]) : undefined,
    locations: Array.isArray(raw.locations) ? (raw.locations as ToolCallLocation[]) : undefined,
    parentToolCallId: typeof raw.parentToolCallId === "string" ? raw.parentToolCallId : undefined,
    subagent:
      raw.subagent !== null && typeof raw.subagent === "object"
        ? (raw.subagent as SubagentRunSummary)
        : undefined,
    liveOutput: typeof raw.liveOutput === "string" ? raw.liveOutput : undefined,
  };
}
