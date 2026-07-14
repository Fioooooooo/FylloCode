import type { ChatPromptPart } from "@shared/types/chat-prompt";

/**
 * Port for sending a user message and waiting until it has been durably appended
 * to the session message store. The implementation must not change the public
 * signature of `chatStore.sendMessage`.
 */
export interface SendMessageAndAwaitDurableAppendPort {
  (parts: ChatPromptPart[]): Promise<{ messageId: string }>;
}

/**
 * Port for reading the current chat status.
 */
export interface GetChatStatusPort {
  (): "idle" | "submitted" | "streaming" | "error";
}
