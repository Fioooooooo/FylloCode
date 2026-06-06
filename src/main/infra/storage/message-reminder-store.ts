import { promises as fs } from "fs";
import type { UIMessage, TextUIPart } from "ai";
import type { MessageMeta } from "@shared/types/chat";

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
    throw new Error(`No messages found in ${filePath}`);
  }

  const messages = lines.map((line) => JSON.parse(line) as UIMessage<MessageMeta>);
  const lastUserIndex = [...messages].map((message) => message.role).lastIndexOf("user");
  if (lastUserIndex < 0) {
    throw new Error(`No user message found in ${filePath}`);
  }

  const message = messages[lastUserIndex];
  message.parts = [reminderPart, ...message.parts];

  const nextContent = `${messages.map((entry) => JSON.stringify(entry)).join("\n")}\n`;
  await fs.writeFile(filePath, nextContent, "utf8");
}
