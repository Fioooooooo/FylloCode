import type { Session } from "@shared/types/chat";
import { collectPendingFylloActions } from "../model/pending-actions";
import { rendererActionDefinitions } from "../ui/renderer-registry";
import type { FylloActionType } from "@shared/fyllo-action/protocol";

export interface FylloActionRailContributorItem {
  actionId: string;
  type: FylloActionType;
  title: string;
  icon: string;
  summary?: string;
  contextPaths?: string[];
}

/**
 * Convert a session into EventRail contributor items for Fyllo Action.
 *
 * This is an integration-layer adapter: it takes the feature-owned `PendingFylloAction`
 * projection and adds renderer-specific presentation data (title, icon, summary).
 */
export function collectFylloActionRailItems(
  session: Session | null
): FylloActionRailContributorItem[] {
  const pending = collectPendingFylloActions(session);

  return pending.map((action) => {
    const definition = rendererActionDefinitions[action.type];
    return {
      actionId: action.actionId,
      type: action.type,
      title: definition.title,
      icon: definition.icon,
      summary: definition.getSummary?.(action.payload as never),
      contextPaths:
        action.type === "knowledge.flag"
          ? (action.payload as { contextPaths?: string[] }).contextPaths
          : undefined,
    };
  });
}
