import { generateId, type DynamicToolUIPart, type UIMessage } from "ai";
import type { MessageMeta } from "@shared/types/chat";
import type { SessionEvent } from "./session-events";

export class MessageAssembler {
  private currentMessage: UIMessage<MessageMeta> | null = null;
  private activeTextPartIdx = -1;
  private activeReasoningPartIdx = -1;

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

  apply(ev: SessionEvent): void {
    if (ev.type === "text_delta") {
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

    if (ev.type === "reasoning_delta") {
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

    if (ev.type === "tool_call_start") {
      const message = this.ensureMessage();
      const part: DynamicToolUIPart = {
        type: "dynamic-tool",
        toolCallId: ev.toolCallId,
        toolName: ev.title,
        state: "input-available",
        input: {},
      };
      message.parts.push(part);
      this.activeTextPartIdx = -1;
      this.activeReasoningPartIdx = -1;
      return;
    }

    if (ev.type === "tool_call_update") {
      if (!this.currentMessage) {
        return;
      }

      const idx = this.currentMessage.parts.findIndex(
        (part) => part.type === "dynamic-tool" && part.toolCallId === ev.toolCallId
      );
      if (idx === -1) {
        return;
      }

      const prev = this.currentMessage.parts[idx] as DynamicToolUIPart;
      const description =
        typeof ev.input?.description === "string" ? ev.input.description : undefined;

      if (ev.status === "in_progress") {
        const needsUpdate = ev.input || ev.content;
        if (needsUpdate) {
          this.currentMessage.parts.splice(idx, 1, {
            type: "dynamic-tool",
            toolCallId: prev.toolCallId,
            toolName: prev.toolName,
            title: description ?? ev.content,
            state: "input-available",
            input: ev.input ?? prev.input,
          } as DynamicToolUIPart);
        }
      } else if (ev.status === "completed" || ev.status === "failed") {
        this.currentMessage.parts.splice(idx, 1, {
          type: "dynamic-tool",
          toolCallId: prev.toolCallId,
          toolName: prev.toolName,
          title: prev.title,
          state: "output-available",
          input: prev.input,
          output: ev.content ?? "",
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
    return message;
  }
}
