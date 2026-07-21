import type { SessionUpdate } from "@agentclientprotocol/sdk";
import type { SessionEvent } from "@main/domain/session/chat/session-events";
import type {
  AcpToolCallStartUpdate,
  AcpToolCallUpdate,
  ToolCallStartEvent,
  ToolCallUpdateEvent,
} from "../tool-call-mapper";

export type AcpThoughtUpdate = Extract<SessionUpdate, { sessionUpdate: "agent_thought_chunk" }>;
export type ReasoningDeltaEvent = Extract<SessionEvent, { kind: "reasoning_delta" }>;

/**
 * Agent adapter 只能在 ACP 基线事件上做同类事件增强，避免复制完整协议映射。
 */
export interface AcpAgentEventAdapter {
  mapThought(update: AcpThoughtUpdate, event: ReasoningDeltaEvent): ReasoningDeltaEvent | null;
  mapToolCallStart(update: AcpToolCallStartUpdate, event: ToolCallStartEvent): ToolCallStartEvent;
  mapToolCallUpdate(
    update: AcpToolCallUpdate,
    event: ToolCallUpdateEvent
  ): ToolCallUpdateEvent | null;
}

export const identityAcpAgentEventAdapter: AcpAgentEventAdapter = {
  mapThought: (_update, event) => event,
  mapToolCallStart: (_update, event) => event,
  mapToolCallUpdate: (_update, event) => event,
};
