import type { Session } from "@shared/types/chat";
import type { FylloActionPayloadByType, FylloActionType } from "@shared/fyllo-action/protocol";
import { analyzeFylloActionMarkdown, parseFylloActionNode } from "@shared/fyllo-action/parser";
import { buildChatFylloActionId } from "@shared/fyllo-action/identity";
import { requiresFylloActionAttention } from "./selectors";

export type PendingFylloAction = {
  [Type in FylloActionType]: {
    actionId: string;
    type: Type;
    payload: FylloActionPayloadByType[Type];
  };
}[FylloActionType];

function isAssistantTextPart(
  message: Session["messages"][number],
  part: Session["messages"][number]["parts"][number]
): part is Session["messages"][number]["parts"][number] & { type: "text"; text: string } {
  return message.role === "assistant" && part.type === "text" && typeof part.text === "string";
}

/**
 * 遍历会话中的 assistant text part，投影需要用户处理的 ready / failed Action。
 * 未持久化的 ready Action 与已持久化且仍需 attention 的 Action 使用同一投影。
 * 返回值只包含 feature model；EventRail 等宿主展示字段由 integration 继续转换。
 */
export function collectPendingFylloActions(session: Session | null): PendingFylloAction[] {
  if (!session) {
    return [];
  }

  const items: PendingFylloAction[] = [];

  session.messages.forEach((message, messageIndex) => {
    if (!Array.isArray(message.parts)) {
      return;
    }

    message.parts.forEach((part, partIndex) => {
      if (!isAssistantTextPart(message, part)) {
        return;
      }

      const analysis = analyzeFylloActionMarkdown(part.text);
      analysis.occurrences.forEach((occurrence) => {
        if (occurrence.disposition !== "candidate") {
          return;
        }

        const parseResult = parseFylloActionNode({
          attrs: occurrence.attrs,
          content: occurrence.body,
          loading: !occurrence.closed,
        });
        if (parseResult.status !== "ready") {
          return;
        }

        const actionId = buildChatFylloActionId({
          sessionId: session.id,
          messageIndex,
          partIndex,
          actionOrdinalInPart: occurrence.sourceOrdinal,
        });
        const persistedState = session.actionStates?.[actionId];
        if (persistedState && !requiresFylloActionAttention(persistedState)) {
          return;
        }

        items.push({
          actionId,
          type: parseResult.type,
          payload: parseResult.payload,
        } as PendingFylloAction);
      });
    });
  });

  return items;
}
