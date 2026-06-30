import { isTextUIPart, type UIMessage } from "ai";
import { isUserFilePart, isUserImagePart } from "@renderer/utils/chat-message-parts";
import { isSystemReminderPart } from "@renderer/utils/system-reminder";
import type { MessageMeta } from "@shared/types/chat";

export interface ChatPromptTimelineItem {
  id: string;
  messageId: string;
  index: number;
  label: string;
  preview: string;
}

function getFilePartName(part: UIMessage["parts"][number]): string {
  const value = (part as { filename?: unknown }).filename;
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : "文件附件";
}

function getAttachmentSummary(parts: UIMessage["parts"]): string {
  const imageCount = parts.filter((part) => isUserImagePart(part)).length;
  const fileNames = parts
    .filter((part) => isUserFilePart(part))
    .map((part) => getFilePartName(part));
  const summaries: string[] = [];

  if (imageCount === 1) {
    summaries.push("图片附件");
  } else if (imageCount > 1) {
    summaries.push(`${imageCount} 张图片`);
  }

  summaries.push(...fileNames);
  return summaries.join("、");
}

function getVisibleTextPartText(part: UIMessage["parts"][number]): string | null {
  if (!isTextUIPart(part) || isSystemReminderPart(part)) {
    return null;
  }

  const value = (part as { text?: unknown }).text;
  return typeof value === "string" ? value.trim() : null;
}

function getPromptPreview(message: UIMessage<MessageMeta>): string {
  const visibleText = message.parts
    .map((part) => getVisibleTextPartText(part))
    .filter((text): text is string => typeof text === "string" && text.length > 0)
    .join("\n\n");

  if (visibleText.length > 0) {
    return visibleText;
  }

  return getAttachmentSummary(message.parts);
}

export function collectChatPromptTimelineItems(
  messages: UIMessage<MessageMeta>[]
): ChatPromptTimelineItem[] {
  let userPromptIndex = 0;

  return messages.flatMap((message) => {
    if (message.role !== "user") {
      return [];
    }

    const preview = getPromptPreview(message);
    if (preview.length === 0) {
      return [];
    }

    userPromptIndex += 1;
    return [
      {
        id: message.id,
        messageId: message.id,
        index: userPromptIndex,
        label: String(userPromptIndex),
        preview,
      },
    ];
  });
}
