import { ref, type Ref } from "vue";
import { generateId, type DynamicToolUIPart, type UIMessage } from "ai";
import { getToolCallMessageMetadata, reduceToolCallPart } from "@shared/chat/tool-call-assembly";
import type { MessageMeta } from "@shared/types/chat";
import type { MessageChunkData, TurnMetadataEvent } from "@shared/types/ipc";

export interface UIMessageAssembler {
  messages: Ref<UIMessage<MessageMeta>[]>;
  applyChunk: (chunk: MessageChunkData) => void;
  getActiveAssistantMessageId: () => string | null;
  resetActive: () => void;
  setMessages: (nextMessages: UIMessage<MessageMeta>[]) => void;
}

interface TurnAuditMetadata {
  model?: string;
  effort?: string;
}

/** Builds Renderer messages while keeping transient reasoning and live tool output locally. */
export function useUIMessageAssembler(
  initialMessages?: Ref<UIMessage<MessageMeta>[]>,
  options: { sessionId?: string | (() => string) } = {}
): UIMessageAssembler {
  const messages = initialMessages ?? ref<UIMessage<MessageMeta>[]>([]);
  let activeAssistantId: string | null = null;
  let activeTextPartIdx = -1;
  let activeReasoningPartIdx = -1;
  const toolOutputDeltas = new Map<string, string>();
  const pendingUserMetadata = new Map<string, TurnAuditMetadata & { dispatchedAt: string }>();
  let pendingAssistantMetadata: TurnAuditMetadata | null = null;

  function touch(message: UIMessage<MessageMeta>, at = new Date()): void {
    if (message.metadata) message.metadata.updatedAt = at;
  }

  function finishActiveReasoningPart(): void {
    if (!activeAssistantId || activeReasoningPartIdx < 0) return;

    const message = messages.value.find((item) => item.id === activeAssistantId);
    const part = message?.parts[activeReasoningPartIdx];
    if (message && part?.type === "reasoning" && part.state !== "done") {
      part.state = "done";
      touch(message);
    }
    activeReasoningPartIdx = -1;
  }

  function resetActive(): void {
    finishActiveReasoningPart();
    activeAssistantId = null;
    activeTextPartIdx = -1;
    activeReasoningPartIdx = -1;
    toolOutputDeltas.clear();
    pendingAssistantMetadata = null;
  }

  function getActiveAssistantMessageId(): string | null {
    return activeAssistantId;
  }

  function setMessages(nextMessages: UIMessage<MessageMeta>[]): void {
    resetActive();
    pendingUserMetadata.clear();
    messages.value = nextMessages;
  }

  function getSessionId(): string {
    return typeof options.sessionId === "function"
      ? options.sessionId()
      : (options.sessionId ?? "stream");
  }

  function ensureAssistantMessage(): UIMessage<MessageMeta> {
    if (activeAssistantId) {
      const existing = messages.value.find((message) => message.id === activeAssistantId);
      if (existing) return existing;
    }

    const createdAt = new Date();
    const message: UIMessage<MessageMeta> = {
      id: generateId(),
      role: "assistant",
      parts: [],
      metadata: {
        sessionId: getSessionId(),
        createdAt,
        updatedAt: createdAt,
        ...pendingAssistantMetadata,
      },
    };
    messages.value.push(message);
    activeAssistantId = message.id;
    activeTextPartIdx = -1;
    activeReasoningPartIdx = -1;
    return message;
  }

  function patchAuditMetadata(
    message: UIMessage<MessageMeta>,
    audit: TurnAuditMetadata,
    at: Date
  ): boolean {
    const metadata = message.metadata;
    if (!metadata) return false;
    let changed = false;
    if (audit.model !== undefined && metadata.model !== audit.model) {
      metadata.model = audit.model;
      changed = true;
    }
    if (audit.effort !== undefined && metadata.effort !== audit.effort) {
      metadata.effort = audit.effort;
      changed = true;
    }
    if (changed) touch(message, at);
    return changed;
  }

  function applyTurnMetadata(event: TurnMetadataEvent): void {
    const audit: TurnAuditMetadata = {
      ...(event.model === undefined ? {} : { model: event.model }),
      ...(event.effort === undefined ? {} : { effort: event.effort }),
    };
    const dispatchedAt = new Date(event.dispatchedAt);
    const at = Number.isNaN(dispatchedAt.getTime()) ? new Date() : dispatchedAt;
    const userMessage = messages.value.find(
      (message) => message.id === event.userMessageId && message.role === "user"
    );
    if (userMessage) patchAuditMetadata(userMessage, audit, at);
    else
      pendingUserMetadata.set(event.userMessageId, { ...audit, dispatchedAt: event.dispatchedAt });

    pendingAssistantMetadata = { ...pendingAssistantMetadata, ...audit };
    if (activeAssistantId) {
      const assistant = messages.value.find((message) => message.id === activeAssistantId);
      if (assistant) patchAuditMetadata(assistant, audit, at);
    }
  }

  function applyToolEvent(
    chunk: Extract<MessageChunkData, { kind: "tool_call_start" | "tool_call_update" }>
  ): void {
    finishActiveReasoningPart();
    const message = ensureAssistantMessage();
    const index = message.parts.findIndex(
      (part) => part.type === "dynamic-tool" && part.toolCallId === chunk.toolCallId
    );
    const previous = index === -1 ? null : (message.parts[index] as DynamicToolUIPart);
    const previousLiveOutput = previous
      ? getToolCallMessageMetadata(previous).liveOutput
      : undefined;
    const result = reduceToolCallPart({
      previous,
      event: chunk,
      accumulatedOutput: toolOutputDeltas.get(chunk.toolCallId),
    });

    if (result.terminal || result.accumulatedOutput.length === 0) {
      toolOutputDeltas.delete(chunk.toolCallId);
    } else {
      toolOutputDeltas.set(chunk.toolCallId, result.accumulatedOutput);
    }

    const part = result.part;
    const metadata = {
      ...((part.toolMetadata as Record<string, unknown> | undefined) ?? {}),
    };
    const nextLiveOutput =
      result.terminal || result.accumulatedOutput.length === 0
        ? undefined
        : result.accumulatedOutput;
    if (nextLiveOutput === undefined) delete metadata.liveOutput;
    else metadata.liveOutput = nextLiveOutput;
    part.toolMetadata =
      Object.keys(metadata).length > 0
        ? (metadata as DynamicToolUIPart["toolMetadata"])
        : undefined;

    const liveOutputChanged = previousLiveOutput !== nextLiveOutput;
    if (!result.changed && !liveOutputChanged) return;
    if (index === -1) message.parts.push(part);
    else message.parts.splice(index, 1, part);
    activeTextPartIdx = -1;
    activeReasoningPartIdx = -1;
    touch(message);
  }

  function applyChunk(chunk: MessageChunkData): void {
    switch (chunk.kind) {
      case "turn_metadata":
        applyTurnMetadata(chunk);
        return;
      case "text_delta": {
        finishActiveReasoningPart();
        const message = ensureAssistantMessage();
        const part = activeTextPartIdx >= 0 ? message.parts[activeTextPartIdx] : null;
        if (part?.type === "text") part.text += chunk.text;
        else {
          message.parts.push({ type: "text", text: chunk.text });
          activeTextPartIdx = message.parts.length - 1;
        }
        touch(message);
        return;
      }
      case "reasoning_delta": {
        const message = ensureAssistantMessage();
        const part = activeReasoningPartIdx >= 0 ? message.parts[activeReasoningPartIdx] : null;
        if (part?.type === "reasoning") part.text += chunk.text;
        else {
          message.parts.push({ type: "reasoning", text: chunk.text, state: "streaming" });
          activeReasoningPartIdx = message.parts.length - 1;
        }
        activeTextPartIdx = -1;
        touch(message);
        return;
      }
      case "tool_call_start":
      case "tool_call_update":
        applyToolEvent(chunk);
        return;
      case "available_commands_update":
      case "config_options_update":
      case "agenda_update":
      case "usage_update":
      case "session_info_update":
      case "status":
        return;
      case "user_message": {
        messages.value.push(chunk.message);
        const pending = pendingUserMetadata.get(chunk.message.id);
        if (pending) {
          const parsed = new Date(pending.dispatchedAt);
          patchAuditMetadata(
            chunk.message,
            pending,
            Number.isNaN(parsed.getTime()) ? new Date() : parsed
          );
          pendingUserMetadata.delete(chunk.message.id);
        }
        resetActive();
        if (pending) {
          pendingAssistantMetadata = {
            ...(pending.model === undefined ? {} : { model: pending.model }),
            ...(pending.effort === undefined ? {} : { effort: pending.effort }),
          };
        }
        return;
      }
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
