import type { Session } from "@shared/types/chat";
import type { FylloActionPayloadByType, FylloActionType } from "@shared/fyllo-action/protocol";
import { collectFylloActionSources, parseFylloActionNode } from "@shared/fyllo-action/parser";
import { buildChatFylloActionId } from "@shared/fyllo-action/identity";

export type PendingFylloAction = {
  [Type in FylloActionType]: {
    actionId: string;
    type: Type;
    payload: FylloActionPayloadByType[Type];
  };
}[FylloActionType];

function hasPersistedState(session: Session, actionId: string): boolean {
  return Object.prototype.hasOwnProperty.call(session.actionStates ?? {}, actionId);
}

function isAssistantTextPart(
  message: Session["messages"][number],
  part: Session["messages"][number]["parts"][number]
): part is Session["messages"][number]["parts"][number] & { type: "text"; text: string } {
  return message.role === "assistant" && part.type === "text" && typeof part.text === "string";
}

/**
 * Walk through all assistant text parts in a session and collect Fyllo actions that have
 * not yet been acted upon (no persisted terminal state).
 *
 * The result is a feature-owned projection; callers such as EventRail integration add
 * presentation data (title/icon/summary) on top of it.
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

      collectFylloActionSources(part.text).forEach((source, actionOrdinalInPart) => {
        const parseResult = parseFylloActionNode(source);
        if (parseResult.status !== "ready") {
          return;
        }

        const actionId = buildChatFylloActionId({
          sessionId: session.id,
          messageIndex,
          partIndex,
          actionOrdinalInPart,
        });
        if (hasPersistedState(session, actionId)) {
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
