import { ref, type Ref } from "vue";
import { generateId, type DynamicToolUIPart, type UIMessage } from "ai";
import type { MessageMeta } from "@shared/types/chat";
import type { MessageChunkData } from "@shared/types/ipc";

export interface UIMessageAssembler {
  messages: Ref<UIMessage<MessageMeta>[]>;
  applyChunk: (chunk: MessageChunkData) => void;
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
    toolKind: string | undefined
  ): DynamicToolUIPart["toolMetadata"] {
    const existing = prev?.toolMetadata;
    // Prefer the existing toolKind once set; only overwrite if we did not have one before.
    if (typeof existing?.toolKind === "string" && existing.toolKind.length > 0) {
      return existing;
    }

    if (typeof toolKind === "string" && toolKind.length > 0) {
      return { ...(existing ?? {}), toolKind };
    }

    return existing;
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
        toolName: chunk.title ?? chunk.toolCallId,
        state: "input-available",
        input: chunk.input ?? {},
        toolMetadata: toolMetadataFor(null, chunk.toolKind),
      } as DynamicToolUIPart);
      idx = message.parts.length - 1;
      activeTextPartIdx = -1;
      activeReasoningPartIdx = -1;
    }

    const prev = message.parts[idx] as DynamicToolUIPart;
    const description =
      typeof chunk.input?.description === "string" ? chunk.input.description : undefined;

    if (chunk.status === "in_progress") {
      const needsUpdate = chunk.input || chunk.content;
      if (needsUpdate) {
        message.parts.splice(idx, 1, {
          type: "dynamic-tool",
          toolCallId: prev.toolCallId,
          toolName: prev.toolName,
          title: description ?? chunk.content,
          state: "input-available",
          input: chunk.input ?? prev.input,
          toolMetadata: toolMetadataFor(prev, chunk.toolKind),
        } as DynamicToolUIPart);
      }
      return;
    }

    if (chunk.status === "completed" || chunk.status === "failed") {
      message.parts.splice(idx, 1, {
        type: "dynamic-tool",
        toolCallId: prev.toolCallId,
        toolName: prev.toolName,
        title: prev.title,
        state: "output-available",
        input: prev.input,
        output: chunk.content ?? "",
        toolMetadata: toolMetadataFor(prev, chunk.toolKind),
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
          toolName: chunk.title,
          state: "input-available",
          input: {},
          toolMetadata: { toolKind: chunk.toolKind },
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
    resetActive,
    setMessages,
  };
}
