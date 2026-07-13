import { getFylloActionDefinition } from "@renderer/config/fyllo-actions";
import {
  buildChatFylloActionId,
  collectFylloActionSources,
  parseFylloActionNode,
} from "@renderer/utils/fyllo-action";
import type { Session } from "@shared/types/chat";
import type { FylloActionReadyParseResult, FylloActionType } from "@shared/types/fyllo-action";

export interface PendingFylloActionRailItem {
  actionId: string;
  type: FylloActionType;
  title: string;
  icon: string;
  summary?: string;
  contextPaths?: string[];
}

function hasActionState(session: Session, actionId: string): boolean {
  return Object.prototype.hasOwnProperty.call(session.actionStates ?? {}, actionId);
}

function isAssistantTextPart(
  message: Session["messages"][number],
  part: Session["messages"][number]["parts"][number]
): part is Session["messages"][number]["parts"][number] & { type: "text"; text: string } {
  return message.role === "assistant" && part.type === "text" && typeof part.text === "string";
}

function getActionSummary(parseResult: FylloActionReadyParseResult): string | undefined {
  return getFylloActionDefinition(parseResult.type).getSummary?.(parseResult.payload as never) as
    | string
    | undefined;
}

function getKnowledgeFlagContextPaths(
  parseResult: FylloActionReadyParseResult
): string[] | undefined {
  if (parseResult.type !== "knowledge.flag") {
    return undefined;
  }

  return parseResult.payload.contextPaths;
}

/**
 * Walk through all assistant text parts in a session and collect Fyllo actions that have
 * not yet been acted upon (no action state persisted).
 *
 * The resulting items are displayed in the session rail so the user can confirm them.
 */
export function collectPendingFylloActionRailItems(
  session: Session | null
): PendingFylloActionRailItem[] {
  if (!session) {
    return [];
  }

  const items: PendingFylloActionRailItem[] = [];

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
        if (hasActionState(session, actionId)) {
          return;
        }

        const definition = getFylloActionDefinition(parseResult.type);
        items.push({
          actionId,
          type: parseResult.type,
          title: definition.title,
          icon: definition.icon,
          summary: getActionSummary(parseResult),
          contextPaths: getKnowledgeFlagContextPaths(parseResult),
        });
      });
    });
  });

  return items;
}
