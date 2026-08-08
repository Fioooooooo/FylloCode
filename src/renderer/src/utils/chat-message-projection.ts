import { isTextUIPart, type UIMessage } from "ai";
import type { MessageMeta } from "@shared/types/chat";
import { isSystemReminderPart } from "./system-reminder";
import { isUserFilePart, isUserImagePart } from "./chat-message-parts";

// 这里只派生 Renderer 展示数据，不改写 Session 中的持久化消息；Agent 上下文、历史恢复和
// 其他非视觉消费者仍以原始 UIMessage 为事实来源。
export type ChatMessageProjectionHost = "chat" | "side";

export interface ProjectedChatMessage {
  message: UIMessage<MessageMeta>;
  // 过滤消息后仍保留原始坐标，避免 Fyllo Action、Signal 等 identity 随可见列表重排。
  sourceIndex: number;
}

export interface ChatMessageProjectionContext {
  host: ChatMessageProjectionHost;
}

type ChatMessageProjectionRule = (
  projection: ProjectedChatMessage,
  context: ChatMessageProjectionContext
) => ProjectedChatMessage | null;

export function projectVisibleUserMessageParts(parts: UIMessage["parts"]): UIMessage["parts"] {
  return parts.filter((part) => !isSystemReminderPart(part));
}

export function isRenderableUserMessagePart(part: UIMessage["parts"][number]): boolean {
  return isTextUIPart(part) || isUserImagePart(part) || isUserFilePart(part);
}

export function hasRenderableUserMessageContent(parts: UIMessage["parts"]): boolean {
  return parts.some(isRenderableUserMessagePart);
}

const projectInternalUserMessage: ChatMessageProjectionRule = (projection) => {
  if (projection.message.role !== "user") {
    return projection;
  }

  const parts = projectVisibleUserMessageParts(projection.message.parts);
  if (!hasRenderableUserMessageContent(parts)) {
    return null;
  }

  if (parts.length === projection.message.parts.length) {
    return projection;
  }

  return {
    ...projection,
    message: {
      ...projection.message,
      parts,
    },
  };
};

const CHAT_MESSAGE_PROJECTION_RULES = [projectInternalUserMessage] as const;

/**
 * 规则按声明顺序执行并保持纯函数。未来可通过 host 增加局部展示规则，但若需求涉及持久化
 * visibility/origin、消息合并重排或 synthetic message，应升级消息契约，而不是扩张此投影层。
 */
export function projectChatMessages(
  messages: readonly UIMessage<MessageMeta>[],
  context: ChatMessageProjectionContext
): ProjectedChatMessage[] {
  return messages.flatMap((message, sourceIndex) => {
    let projection: ProjectedChatMessage | null = { message, sourceIndex };
    for (const rule of CHAT_MESSAGE_PROJECTION_RULES) {
      if (!projection) break;
      projection = rule(projection, context);
    }
    return projection ? [projection] : [];
  });
}
