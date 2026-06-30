import { computed, nextTick, type ComputedRef, type Ref } from "vue";
import { collectPendingFylloActionRailItems } from "@renderer/utils/fyllo-action-rail";
import type { PendingFylloActionRailItem } from "@renderer/utils/fyllo-action-rail";
import type { PlanEntry, Session } from "@shared/types/chat";
import type { ProposalMeta } from "@shared/types/proposal";

interface UseChatSessionEventRailInput {
  activeSession: Readonly<Ref<Session | null | undefined>>;
  activeSessionId: Readonly<Ref<string | null>>;
  getSessionProposals: (sessionId: string) => ProposalMeta[];
  messageScrollContainerRef: Readonly<Ref<HTMLElement | null>>;
}

function findFylloActionAnchor(container: HTMLElement, actionId: string): HTMLElement | null {
  return container.querySelector<HTMLElement>(`[data-fyllo-action-id="${CSS.escape(actionId)}"]`);
}

export function useChatEventRail(input: UseChatSessionEventRailInput): {
  planEntries: ComputedRef<PlanEntry[]>;
  sessionProposals: ComputedRef<ProposalMeta[]>;
  pendingActionRailItems: ComputedRef<PendingFylloActionRailItem[]>;
  showEventRail: ComputedRef<boolean>;
  locateFylloAction: (actionId: string) => Promise<void>;
} {
  const planEntries = computed(() => input.activeSession.value?.plan ?? []);
  const sessionProposals = computed(() =>
    input.activeSession.value ? input.getSessionProposals(input.activeSession.value.id) : []
  );
  const pendingActionRailItems = computed(() =>
    collectPendingFylloActionRailItems(input.activeSession.value ?? null)
  );
  const showEventRail = computed(
    () =>
      input.activeSessionId.value !== null &&
      (planEntries.value.length > 0 ||
        sessionProposals.value.length > 0 ||
        pendingActionRailItems.value.length > 0)
  );

  async function locateFylloAction(actionId: string): Promise<void> {
    await nextTick();

    const container = input.messageScrollContainerRef.value;
    if (!container) {
      return;
    }

    const target = findFylloActionAnchor(container, actionId);
    target?.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  return {
    planEntries,
    sessionProposals,
    pendingActionRailItems,
    showEventRail,
    locateFylloAction,
  };
}
