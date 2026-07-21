import { generateId, type DynamicToolUIPart, type UIMessage } from "ai";
import type { MessageMeta } from "@shared/types/chat";
import type { SubagentRunSummary } from "@shared/types/stream-event";
import type { SessionEvent } from "./session-events";

/**
 * Incrementally assemble a single assistant `UIMessage` from a stream of `SessionEvent`s.
 *
 * The assembler tracks which text/reasoning part is currently receiving deltas so that
 * consecutive deltas of the same kind append to the same part rather than creating new ones.
 */
export class MessageAssembler {
  private currentMessage: UIMessage<MessageMeta> | null = null;
  private activeTextPartIdx = -1;
  private activeReasoningPartIdx = -1;
  private readonly toolOutputDeltas = new Map<string, string>();

  constructor(private readonly sessionId: string) {}

  private ensureMessage(): UIMessage<MessageMeta> {
    if (this.currentMessage) {
      return this.currentMessage;
    }

    this.currentMessage = {
      id: generateId(),
      role: "assistant",
      parts: [],
      metadata: { sessionId: this.sessionId, createdAt: new Date() },
    };
    this.activeTextPartIdx = -1;
    this.activeReasoningPartIdx = -1;
    return this.currentMessage;
  }

  private toolMetadataFor(
    prev: DynamicToolUIPart | null,
    toolKind: string | undefined,
    parentToolCallId?: string,
    subagent?: SubagentRunSummary
  ): DynamicToolUIPart["toolMetadata"] {
    const existing = prev?.toolMetadata ?? {};
    const next = { ...existing };

    // 已有 toolKind 优先保留，仅在此前缺失时写入。
    if (
      !(typeof existing.toolKind === "string" && existing.toolKind.length > 0) &&
      typeof toolKind === "string" &&
      toolKind.length > 0
    ) {
      next.toolKind = toolKind;
    }

    // 首次确认父子关系后保持稳定，供渲染层构建子 Agent 工具树。
    if (
      !(typeof next.parentToolCallId === "string" && next.parentToolCallId.length > 0) &&
      typeof parentToolCallId === "string" &&
      parentToolCallId.length > 0
    ) {
      next.parentToolCallId = parentToolCallId;
    }

    if (subagent !== undefined) {
      const existingSubagent =
        next.subagent !== null && typeof next.subagent === "object"
          ? (next.subagent as SubagentRunSummary)
          : undefined;
      const mergedSubagent: SubagentRunSummary = { ...existingSubagent, ...subagent };
      if (existingSubagent?.toolStats || subagent.toolStats) {
        mergedSubagent.toolStats = {
          ...existingSubagent?.toolStats,
          ...subagent.toolStats,
        };
      }
      (next as Record<string, unknown>).subagent = mergedSubagent;
    }

    return Object.keys(next).length > 0 ? next : undefined;
  }

  apply(ev: SessionEvent): void {
    if (ev.kind === "text_delta") {
      const message = this.ensureMessage();
      const part = this.activeTextPartIdx >= 0 ? message.parts[this.activeTextPartIdx] : null;

      if (part && part.type === "text") {
        part.text += ev.text;
      } else {
        message.parts.push({ type: "text", text: ev.text });
        this.activeTextPartIdx = message.parts.length - 1;
      }
      this.activeReasoningPartIdx = -1;
      return;
    }

    if (ev.kind === "reasoning_delta") {
      const message = this.ensureMessage();
      const part =
        this.activeReasoningPartIdx >= 0 ? message.parts[this.activeReasoningPartIdx] : null;

      if (part && part.type === "reasoning") {
        part.text += ev.text;
      } else {
        message.parts.push({ type: "reasoning", text: ev.text });
        this.activeReasoningPartIdx = message.parts.length - 1;
      }
      this.activeTextPartIdx = -1;
      return;
    }

    if (ev.kind === "tool_call_start") {
      const message = this.ensureMessage();
      const part: DynamicToolUIPart = {
        type: "dynamic-tool",
        toolCallId: ev.toolCallId,
        toolName: ev.toolName ?? ev.title,
        title: ev.title,
        state: "input-available",
        input: ev.input ?? {},
        toolMetadata: this.toolMetadataFor(null, ev.toolKind, ev.parentToolCallId, ev.subagent),
      };
      message.parts.push(part);
      this.activeTextPartIdx = -1;
      this.activeReasoningPartIdx = -1;
      return;
    }

    if (ev.kind === "tool_call_update") {
      const message = this.ensureMessage();

      let idx = message.parts.findIndex(
        (part) => part.type === "dynamic-tool" && part.toolCallId === ev.toolCallId
      );
      if (idx === -1) {
        // 孤儿 update（gemini 跳过 tool_call start）：用 update 自带 title/toolKind 惰性建卡。
        message.parts.push({
          type: "dynamic-tool",
          toolCallId: ev.toolCallId,
          toolName: ev.toolName ?? ev.title ?? ev.toolCallId,
          title: ev.title,
          state: "input-available",
          input: ev.input ?? {},
          toolMetadata: this.toolMetadataFor(null, ev.toolKind, ev.parentToolCallId, ev.subagent),
        } as DynamicToolUIPart);
        idx = message.parts.length - 1;
        this.activeTextPartIdx = -1;
        this.activeReasoningPartIdx = -1;
      }

      const prev = message.parts[idx] as DynamicToolUIPart;
      const description =
        typeof ev.input?.description === "string" ? ev.input.description : undefined;
      const accumulatedOutput = `${this.toolOutputDeltas.get(ev.toolCallId) ?? ""}${ev.outputDelta ?? ""}`;
      if (ev.outputDelta) {
        this.toolOutputDeltas.set(ev.toolCallId, accumulatedOutput);
      }

      if (ev.status === "in_progress") {
        const needsUpdate =
          ev.input ||
          ev.content ||
          ev.outputDelta ||
          ev.title ||
          ev.toolName ||
          ev.parentToolCallId ||
          ev.subagent !== undefined;
        if (needsUpdate) {
          message.parts.splice(idx, 1, {
            type: "dynamic-tool",
            toolCallId: prev.toolCallId,
            toolName: ev.toolName ?? prev.toolName,
            title:
              ev.title ?? description ?? (ev.outputDelta ? prev.title : ev.content) ?? prev.title,
            state: "input-available",
            input: ev.input ?? prev.input,
            toolMetadata: this.toolMetadataFor(prev, ev.toolKind, ev.parentToolCallId, ev.subagent),
          } as DynamicToolUIPart);
        }
      } else if (ev.status === "completed" || ev.status === "failed") {
        this.toolOutputDeltas.delete(ev.toolCallId);
        message.parts.splice(idx, 1, {
          type: "dynamic-tool",
          toolCallId: prev.toolCallId,
          toolName: ev.toolName ?? prev.toolName,
          title: ev.title ?? prev.title,
          state: "output-available",
          input: ev.input ?? prev.input,
          output: ev.content ?? accumulatedOutput,
          toolMetadata: this.toolMetadataFor(prev, ev.toolKind, ev.parentToolCallId, ev.subagent),
        } as DynamicToolUIPart);
      }
    }
  }

  flush(): UIMessage<MessageMeta> | null {
    if (!this.currentMessage) {
      return null;
    }

    const message = this.currentMessage;
    this.currentMessage = null;
    this.activeTextPartIdx = -1;
    this.activeReasoningPartIdx = -1;
    this.toolOutputDeltas.clear();
    return message;
  }
}
