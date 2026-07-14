import { computed, nextTick, type ComputedRef, type Ref } from "vue";
import {
  collectFylloActionRailItems,
  type FylloActionRailContributorItem,
} from "@renderer/features/fyllo-action";
import type { AgendaEntry, Session } from "@shared/types/chat";
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
  agentAgendaEntries: ComputedRef<AgendaEntry[]>;
  sessionProposals: ComputedRef<ProposalMeta[]>;
  pendingActionRailItems: ComputedRef<FylloActionRailContributorItem[]>;
  showEventRail: ComputedRef<boolean>;
  locateFylloAction: (actionId: string) => Promise<void>;
} {
  const agentAgendaEntries = computed(() => input.activeSession.value?.agentAgenda ?? []);
  const sessionProposals = computed(() =>
    input.activeSession.value ? input.getSessionProposals(input.activeSession.value.id) : []
  );
  const pendingActionRailItems = computed(() =>
    collectFylloActionRailItems(input.activeSession.value ?? null)
  );
  const showEventRail = computed(
    () =>
      input.activeSessionId.value !== null &&
      (agentAgendaEntries.value.length > 0 ||
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
    agentAgendaEntries,
    sessionProposals,
    pendingActionRailItems,
    showEventRail,
    locateFylloAction,
  };
}
