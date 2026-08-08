import { isTextUIPart, type UIMessage } from "ai";
import { isUserFilePart, isUserImagePart } from "@renderer/utils/chat-message-parts";
import { projectVisibleUserMessageParts } from "@renderer/utils/chat-message-projection";
import type { MessageMeta } from "@shared/types/chat";
import {
  collectChatPromptTimelineItems,
  type ChatPromptTimelineItem,
  type ChatPromptTimelineSource,
} from "../model/chat-prompt-timeline";

function getFilePartName(part: UIMessage["parts"][number]): string {
  const value = (part as { filename?: unknown }).filename;
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : "文件附件";
}

function getAttachmentSummaries(parts: UIMessage["parts"]): string[] {
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
  return summaries;
}

function getVisibleTextParts(parts: UIMessage["parts"]): string[] {
  return projectVisibleUserMessageParts(parts).flatMap((part) => {
    if (!isTextUIPart(part)) {
      return [];
    }

    const value = (part as { text?: unknown }).text;
    return typeof value === "string" ? [value] : [];
  });
}

function toPromptTimelineSource(message: UIMessage<MessageMeta>): ChatPromptTimelineSource {
  return {
    id: message.id,
    messageId: message.id,
    role: message.role === "user" ? "user" : "other",
    visibleTextParts: getVisibleTextParts(message.parts),
    attachmentSummaries: getAttachmentSummaries(message.parts),
  };
}

export function projectChatPromptTimelineItems(
  messages: readonly UIMessage<MessageMeta>[]
): ChatPromptTimelineItem[] {
  return collectChatPromptTimelineItems(messages.map(toPromptTimelineSource));
}
