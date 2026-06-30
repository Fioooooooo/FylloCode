import { getFylloActionDefinition } from "@renderer/config/fyllo-actions";
import { buildChatFylloActionId, parseFylloActionNode } from "@renderer/utils/fyllo-action";
import type { Session } from "@shared/types/chat";
import type { FylloActionReadyParseResult, FylloActionType } from "@shared/types/fyllo-action";

export interface PendingFylloActionRailItem {
  actionId: string;
  type: FylloActionType;
  title: string;
  icon: string;
  summary?: string;
}

interface ParsedFylloActionSource {
  attrs: Record<string, string>;
  content: string;
  loading: boolean;
}

const fylloActionTagPattern = /<fyllo-action\b([^>]*)>([\s\S]*?)(<\/fyllo-action>|$)/g;
const fylloActionAttrPattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>/]+)))?/g;

function hasActionState(session: Session, actionId: string): boolean {
  return Object.prototype.hasOwnProperty.call(session.actionStates ?? {}, actionId);
}

function parseFylloActionAttrs(rawAttrs: string): Record<string, string> {
  return Object.fromEntries(
    Array.from(rawAttrs.matchAll(fylloActionAttrPattern), (match) => [
      match[1],
      match[2] ?? match[3] ?? match[4] ?? "",
    ])
  );
}

function collectFylloActionSources(source: string): ParsedFylloActionSource[] {
  return Array.from(source.matchAll(fylloActionTagPattern), (match) => ({
    attrs: parseFylloActionAttrs(match[1] ?? ""),
    content: match[2] ?? "",
    loading: match[3] !== "</fyllo-action>",
  }));
}

function isAssistantTextPart(
  message: Session["messages"][number],
  part: Session["messages"][number]["parts"][number]
): part is Session["messages"][number]["parts"][number] & { type: "text"; text: string } {
  return message.role === "assistant" && part.type === "text" && typeof part.text === "string";
}

function getActionSummary(parseResult: FylloActionReadyParseResult): string | undefined {
  switch (parseResult.type) {
    case "task.create":
      return getFylloActionDefinition("task.create").getSummary?.(parseResult.payload);
    case "plan.create":
      return getFylloActionDefinition("plan.create").getSummary?.(parseResult.payload);
  }
}

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
        });
      });
    });
  });

  return items;
}
