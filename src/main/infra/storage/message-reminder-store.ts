import { promises as fs } from "fs";
import type { UIMessage, TextUIPart } from "ai";
import type { MessageMeta } from "@shared/types/chat";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import { ipcError } from "@shared/errors/ipc-error";

export async function prependReminderToLastUserMessage(
  filePath: string,
  reminderPart: TextUIPart
): Promise<void> {
  const content = await fs.readFile(filePath, "utf8");
  const lines = content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    throw ipcError(IpcErrorCodes.UNKNOWN_ERROR, `No messages found in ${filePath}`);
  }

  // 写路径（读改写后写回）：损坏行不可静默跳过，否则写回时会丢数据。
  // 因此逐行解析并在失败时抛出带定位的错误，让调用方明确感知而非整体崩溃。
  const messages = lines.map((line, index) => {
    try {
      return JSON.parse(line) as UIMessage<MessageMeta>;
    } catch {
      throw ipcError(
        IpcErrorCodes.UNKNOWN_ERROR,
        `Malformed message at line ${index + 1} in ${filePath}`
      );
    }
  });
  const lastUserIndex = [...messages].map((message) => message.role).lastIndexOf("user");
  if (lastUserIndex < 0) {
    throw ipcError(IpcErrorCodes.UNKNOWN_ERROR, `No user message found in ${filePath}`);
  }

  const message = messages[lastUserIndex];
  message.parts = [reminderPart, ...message.parts];

  const nextContent = `${messages.map((entry) => JSON.stringify(entry)).join("\n")}\n`;
  await fs.writeFile(filePath, nextContent, "utf8");
}
