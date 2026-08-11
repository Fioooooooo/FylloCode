import type { UIMessage, TextUIPart } from "ai";
import type { MessageMeta } from "@shared/types/chat";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import { ipcError } from "@shared/errors/ipc-error";
import { mutateMessageJsonl } from "./message-jsonl-store";

export async function prependReminderToLastUserMessage(
  filePath: string,
  reminderPart: TextUIPart
): Promise<void> {
  await mutateMessageJsonl(filePath, (messages) => {
    if (messages.length === 0) {
      throw ipcError(IpcErrorCodes.UNKNOWN_ERROR, `No messages found in ${filePath}`);
    }
    const lastUserIndex = [...messages].map((message) => message.role).lastIndexOf("user");
    if (lastUserIndex < 0) {
      throw ipcError(IpcErrorCodes.UNKNOWN_ERROR, `No user message found in ${filePath}`);
    }

    const message = messages[lastUserIndex] as UIMessage<MessageMeta>;
    message.parts = [reminderPart, ...message.parts];
    if (message.metadata) message.metadata.updatedAt = new Date();
  });
}
