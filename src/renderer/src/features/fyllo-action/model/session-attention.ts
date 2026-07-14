import type { Session } from "@shared/types/chat";
import { collectPendingFylloActions } from "./pending-actions";
import { requiresFylloActionAttention } from "./selectors";

/**
 * Count how many Fyllo Action attention items the session currently has.
 *
 * This aggregates:
 * - persisted action states that are `ready` or `failed`
 * - pending actions parsed from assistant messages that have not yet been persisted
 *
 * Succeeded/cancelled actions are not attention items.
 */
export function getSessionAttention(session: Session | null | undefined): number {
  if (!session) {
    return 0;
  }

  const persistedStates = Object.values(session.actionStates ?? {});
  const persistedAttentionCount = persistedStates.filter((state) =>
    requiresFylloActionAttention(state)
  ).length;

  const pendingCount = collectPendingFylloActions(session).length;

  return persistedAttentionCount + pendingCount;
}
