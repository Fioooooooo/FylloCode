import { generateId, type DynamicToolUIPart, type UIMessage } from "ai";
import { reduceToolCallPart } from "@shared/chat/tool-call-assembly";
import type { MessageMeta } from "@shared/types/chat";
import type { TurnMetadataEvent } from "@shared/types/ipc";
import type { SessionEvent } from "./session-events";

interface TurnAuditMetadata {
  model?: string;
  effort?: string;
}

/** Incrementally assembles one persistable assistant message for a single ACP turn. */
export class MessageAssembler {
  private currentMessage: UIMessage<MessageMeta> | null = null;
  private activeTextPartIdx = -1;
  private activeReasoningPartIdx = -1;
  private readonly toolOutputDeltas = new Map<string, string>();
  private pendingTurnMetadata: TurnAuditMetadata | null = null;

  constructor(private readonly sessionId: string) {}

  private ensureMessage(): UIMessage<MessageMeta> {
    if (this.currentMessage) return this.currentMessage;

    const createdAt = new Date();
    this.currentMessage = {
      id: generateId(),
      role: "assistant",
      parts: [],
      metadata: {
        sessionId: this.sessionId,
        createdAt,
        updatedAt: createdAt,
        ...this.pendingTurnMetadata,
      },
    };
    this.activeTextPartIdx = -1;
    this.activeReasoningPartIdx = -1;
    return this.currentMessage;
  }

  private touch(message: UIMessage<MessageMeta>): void {
    if (message.metadata) message.metadata.updatedAt = new Date();
  }

  private applyTurnMetadata(event: TurnMetadataEvent): void {
    const next = {
      ...(event.model === undefined ? {} : { model: event.model }),
      ...(event.effort === undefined ? {} : { effort: event.effort }),
    };
    this.pendingTurnMetadata = { ...this.pendingTurnMetadata, ...next };
    const metadata = this.currentMessage?.metadata;
    if (!metadata) return;

    let changed = false;
    if (event.model !== undefined && metadata.model !== event.model) {
      metadata.model = event.model;
      changed = true;
    }
    if (event.effort !== undefined && metadata.effort !== event.effort) {
      metadata.effort = event.effort;
      changed = true;
    }
    if (changed && this.currentMessage) this.touch(this.currentMessage);
  }

  private applyToolEvent(
    event: Extract<SessionEvent, { kind: "tool_call_start" | "tool_call_update" }>
  ): void {
    const message = this.ensureMessage();
    const index = message.parts.findIndex(
      (part) => part.type === "dynamic-tool" && part.toolCallId === event.toolCallId
    );
    const previous = index === -1 ? null : (message.parts[index] as DynamicToolUIPart);
    const result = reduceToolCallPart({
      previous,
      event,
      accumulatedOutput: this.toolOutputDeltas.get(event.toolCallId),
    });

    if (result.terminal || result.accumulatedOutput.length === 0) {
      this.toolOutputDeltas.delete(event.toolCallId);
    } else {
      this.toolOutputDeltas.set(event.toolCallId, result.accumulatedOutput);
    }
    if (!result.changed) return;

    if (index === -1) message.parts.push(result.part);
    else message.parts.splice(index, 1, result.part);
    this.activeTextPartIdx = -1;
    this.activeReasoningPartIdx = -1;
    this.touch(message);
  }

  apply(event: SessionEvent): void {
    if (event.kind === "turn_metadata") {
      this.applyTurnMetadata(event);
      return;
    }

    if (event.kind === "text_delta") {
      const message = this.ensureMessage();
      const part = this.activeTextPartIdx >= 0 ? message.parts[this.activeTextPartIdx] : null;
      if (part?.type === "text") part.text += event.text;
      else {
        message.parts.push({ type: "text", text: event.text });
        this.activeTextPartIdx = message.parts.length - 1;
      }
      this.activeReasoningPartIdx = -1;
      this.touch(message);
      return;
    }

    if (event.kind === "reasoning_delta") {
      const message = this.ensureMessage();
      const part =
        this.activeReasoningPartIdx >= 0 ? message.parts[this.activeReasoningPartIdx] : null;
      if (part?.type === "reasoning") part.text += event.text;
      else {
        message.parts.push({ type: "reasoning", text: event.text });
        this.activeReasoningPartIdx = message.parts.length - 1;
      }
      this.activeTextPartIdx = -1;
      this.touch(message);
      return;
    }

    if (event.kind === "tool_call_start" || event.kind === "tool_call_update") {
      this.applyToolEvent(event);
    }
  }

  snapshot(): UIMessage<MessageMeta> | null {
    return this.currentMessage ? structuredClone(this.currentMessage) : null;
  }

  flush(): UIMessage<MessageMeta> | null {
    if (!this.currentMessage) return null;

    const message = this.currentMessage;
    this.currentMessage = null;
    this.activeTextPartIdx = -1;
    this.activeReasoningPartIdx = -1;
    this.toolOutputDeltas.clear();
    this.pendingTurnMetadata = null;
    return message;
  }
}
