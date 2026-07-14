import type { ChatFylloActionIdInput } from "./protocol";

// Current position-based Action ID format:
// chat:{sessionId}:{messageIndex}:{partIndex}:{actionOrdinalInPart}
export function buildChatFylloActionId(input: ChatFylloActionIdInput): string {
  return [
    "chat",
    input.sessionId,
    String(input.messageIndex),
    String(input.partIndex),
    String(input.actionOrdinalInPart),
  ].join(":");
}

export interface ParsedChatFylloActionId {
  sessionId: string;
  messageIndex: number;
  partIndex: number;
  actionOrdinalInPart: number;
}

export function parseChatFylloActionId(actionId: string): ParsedChatFylloActionId | undefined {
  const parts = actionId.split(":");
  if (parts.length !== 5 || parts[0] !== "chat") {
    return undefined;
  }

  const messageIndex = Number(parts[2]);
  const partIndex = Number(parts[3]);
  const actionOrdinalInPart = Number(parts[4]);

  if (Number.isNaN(messageIndex) || Number.isNaN(partIndex) || Number.isNaN(actionOrdinalInPart)) {
    return undefined;
  }

  return {
    sessionId: parts[1],
    messageIndex,
    partIndex,
    actionOrdinalInPart,
  };
}
