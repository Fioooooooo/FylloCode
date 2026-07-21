import { ref, type Ref } from "vue";
import { generateId, type DynamicToolUIPart, type UIMessage } from "ai";
import type { MessageMeta } from "@shared/types/chat";
import type { MessageChunkData } from "@shared/types/ipc";
import type { SubagentRunSummary } from "@shared/types/stream-event";

export interface UIMessageAssembler {
  messages: Ref<UIMessage<MessageMeta>[]>;
  applyChunk: (chunk: MessageChunkData) => void;
  getActiveAssistantMessageId: () => string | null;
  resetActive: () => void;
  setMessages: (nextMessages: UIMessage<MessageMeta>[]) => void;
}

/**
 * Incrementally build `UIMessage` objects from a stream of `MessageChunkData`.
 *
 * Tracks the currently active assistant message and the active text/reasoning part indices
 * so that consecutive deltas append to the same part instead of creating new ones.
 */
export function useUIMessageAssembler(
  initialMessages?: Ref<UIMessage<MessageMeta>[]>,
  options: { sessionId?: string | (() => string) } = {}
): UIMessageAssembler {
  const messages = initialMessages ?? ref<UIMessage<MessageMeta>[]>([]);
  let activeAssistantId: string | null = null;
  let activeTextPartIdx = -1;
  let activeReasoningPartIdx = -1;
  const toolOutputDeltas = new Map<string, string>();

  function finishActiveReasoningPart(): void {
    if (!activeAssistantId || activeReasoningPartIdx < 0) {
      return;
    }

    // Mark the streaming reasoning part as done when switching to another part type.
    const message = messages.value.find((item) => item.id === activeAssistantId);
    const part = message?.parts[activeReasoningPartIdx];
    if (part?.type === "reasoning" && part.state !== "done") {
      part.state = "done";
    }

    activeReasoningPartIdx = -1;
  }

  function resetActive(): void {
    finishActiveReasoningPart();
    activeAssistantId = null;
    activeTextPartIdx = -1;
    activeReasoningPartIdx = -1;
    toolOutputDeltas.clear();
  }

  function getActiveAssistantMessageId(): string | null {
    return activeAssistantId;
  }

  function setMessages(nextMessages: UIMessage<MessageMeta>[]): void {
    resetActive();
    messages.value = nextMessages;
  }

  function getSessionId(): string {
    return typeof options.sessionId === "function"
      ? options.sessionId()
      : (options.sessionId ?? "stream");
  }

  function toolMetadataFor(
    prev: DynamicToolUIPart | null,
    toolKind: string | undefined,
    liveOutput?: string | null,
    parentToolCallId?: string,
    subagent?: SubagentRunSummary
  ): DynamicToolUIPart["toolMetadata"] {
    const existing = prev?.toolMetadata ?? {};
    const next = { ...existing };
    // Prefer the existing toolKind once set; only overwrite if we did not have one before.
    if (
      !(typeof existing.toolKind === "string" && existing.toolKind.length > 0) &&
      typeof toolKind === "string" &&
      toolKind.length > 0
    ) {
      next.toolKind = toolKind;
    }

    // 首次确认父子关系后保持稳定，供消息组件构建子 Agent 工具树。
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

    if (liveOutput === null) {
      delete next.liveOutput;
    } else if (typeof liveOutput === "string") {
      next.liveOutput = liveOutput;
    }

    return Object.keys(next).length > 0 ? next : undefined;
  }

  function ensureAssistantMessage(): UIMessage<MessageMeta> {
    if (activeAssistantId) {
      const existing = messages.value.find((message) => message.id === activeAssistantId);
      if (existing) {
        return existing;
      }
    }

    const message: UIMessage<MessageMeta> = {
      id: generateId(),
      role: "assistant",
      parts: [],
      metadata: {
        sessionId: getSessionId(),
        createdAt: new Date(),
      },
    };
    messages.value.push(message);
    activeAssistantId = message.id;
    activeTextPartIdx = -1;
    activeReasoningPartIdx = -1;
    return message;
  }

  function applyToolUpdate(chunk: Extract<MessageChunkData, { kind: "tool_call_update" }>): void {
    finishActiveReasoningPart();
    const message = ensureAssistantMessage();

    let idx = message.parts.findIndex(
      (part) => part.type === "dynamic-tool" && part.toolCallId === chunk.toolCallId
    );
    if (idx === -1) {
      // 孤儿 update（gemini 跳过 tool_call start）：用 chunk 自带 title/toolKind 惰性建卡。
      message.parts.push({
        type: "dynamic-tool",
        toolCallId: chunk.toolCallId,
        toolName: chunk.toolName ?? chunk.title ?? chunk.toolCallId,
        title: chunk.title,
        state: "input-available",
        input: chunk.input ?? {},
        toolMetadata: toolMetadataFor(
          null,
          chunk.toolKind,
          undefined,
          chunk.parentToolCallId,
          chunk.subagent
        ),
      } as DynamicToolUIPart);
      idx = message.parts.length - 1;
      activeTextPartIdx = -1;
      activeReasoningPartIdx = -1;
    }

    const prev = message.parts[idx] as DynamicToolUIPart;
    const description =
      typeof chunk.input?.description === "string" ? chunk.input.description : undefined;
    const accumulatedOutput = `${toolOutputDeltas.get(chunk.toolCallId) ?? ""}${chunk.outputDelta ?? ""}`;
    if (chunk.outputDelta) {
      toolOutputDeltas.set(chunk.toolCallId, accumulatedOutput);
    }

    if (chunk.status === "in_progress") {
      const needsUpdate =
        chunk.input ||
        chunk.content ||
        chunk.outputDelta ||
        chunk.title ||
        chunk.toolName ||
        chunk.parentToolCallId ||
        chunk.subagent !== undefined;
      if (needsUpdate) {
        message.parts.splice(idx, 1, {
          type: "dynamic-tool",
          toolCallId: prev.toolCallId,
          toolName: chunk.toolName ?? prev.toolName,
          title:
            chunk.title ??
            description ??
            (chunk.outputDelta ? prev.title : chunk.content) ??
            prev.title,
          state: "input-available",
          input: chunk.input ?? prev.input,
          toolMetadata: toolMetadataFor(
            prev,
            chunk.toolKind,
            chunk.outputDelta ? accumulatedOutput : undefined,
            chunk.parentToolCallId,
            chunk.subagent
          ),
        } as DynamicToolUIPart);
      }
      return;
    }

    if (chunk.status === "completed" || chunk.status === "failed") {
      toolOutputDeltas.delete(chunk.toolCallId);
      message.parts.splice(idx, 1, {
        type: "dynamic-tool",
        toolCallId: prev.toolCallId,
        toolName: chunk.toolName ?? prev.toolName,
        title: chunk.title ?? prev.title,
        state: "output-available",
        input: chunk.input ?? prev.input,
        output: chunk.content ?? accumulatedOutput,
        toolMetadata: toolMetadataFor(
          prev,
          chunk.toolKind,
          null,
          chunk.parentToolCallId,
          chunk.subagent
        ),
      } as DynamicToolUIPart);
    }
  }

  function applyChunk(chunk: MessageChunkData): void {
    switch (chunk.kind) {
      case "text_delta": {
        finishActiveReasoningPart();
        const message = ensureAssistantMessage();
        const part = activeTextPartIdx >= 0 ? message.parts[activeTextPartIdx] : null;

        if (part && part.type === "text") {
          part.text += chunk.text;
        } else {
          message.parts.push({ type: "text", text: chunk.text });
          activeTextPartIdx = message.parts.length - 1;
        }
        return;
      }
      case "reasoning_delta": {
        const message = ensureAssistantMessage();
        const part = activeReasoningPartIdx >= 0 ? message.parts[activeReasoningPartIdx] : null;

        if (part && part.type === "reasoning") {
          part.text += chunk.text;
        } else {
          message.parts.push({ type: "reasoning", text: chunk.text, state: "streaming" });
          activeReasoningPartIdx = message.parts.length - 1;
        }
        activeTextPartIdx = -1;
        return;
      }
      case "tool_call_start": {
        finishActiveReasoningPart();
        const message = ensureAssistantMessage();
        const part: DynamicToolUIPart = {
          type: "dynamic-tool",
          toolCallId: chunk.toolCallId,
          toolName: chunk.toolName ?? chunk.title,
          title: chunk.title,
          state: "input-available",
          input: chunk.input ?? {},
          toolMetadata: toolMetadataFor(
            null,
            chunk.toolKind,
            undefined,
            chunk.parentToolCallId,
            chunk.subagent
          ),
        };
        message.parts.push(part);
        activeTextPartIdx = -1;
        activeReasoningPartIdx = -1;
        return;
      }
      case "tool_call_update":
        applyToolUpdate(chunk);
        return;
      case "available_commands_update":
      case "config_options_update":
      case "agenda_update":
      case "usage_update":
      case "session_info_update":
      case "status":
        return;
      case "user_message":
        messages.value.push(chunk.message);
        resetActive();
        return;
      default: {
        const _exhaustive: never = chunk;
        void _exhaustive;
        throw new Error(`unhandled message chunk: ${(chunk as MessageChunkData).kind}`);
      }
    }
  }

  return {
    messages,
    applyChunk,
    getActiveAssistantMessageId,
    resetActive,
    setMessages,
  };
}
