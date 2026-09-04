import { computed, onBeforeUnmount, ref, toValue, watch, type MaybeRefOrGetter } from "vue";
import { useWorkflowProposalStore } from "@renderer/stores";
import type {
  WorkflowProposalConfirmResult,
  WorkflowProposalDetail,
  WorkflowProposalDetailRequest,
  WorkflowProposalPersist,
} from "@shared/types/workflow";

export interface WorkflowProposalReviewTarget {
  workspaceId: MaybeRefOrGetter<string>;
  parentSessionId: MaybeRefOrGetter<string>;
  proposalId: MaybeRefOrGetter<string>;
}

export function useWorkflowProposalReview(target: WorkflowProposalReviewTarget) {
  const store = useWorkflowProposalStore();
  const open = ref(false);
  const input = computed<WorkflowProposalDetailRequest>(() => ({
    workspaceId: toValue(target.workspaceId),
    parentSessionId: toValue(target.parentSessionId),
    proposalId: toValue(target.proposalId),
  }));
  const state = computed(() =>
    store.detailState(input.value.workspaceId, input.value.parentSessionId, input.value.proposalId)
  );
  const detail = computed<WorkflowProposalDetail | null>(() => state.value.result);
  let releaseDetailInterest: (() => void) | null = null;

  function stopDetailInterest(): void {
    releaseDetailInterest?.();
    releaseDetailInterest = null;
  }

  function startDetailInterest(): void {
    stopDetailInterest();
    if (!input.value.proposalId) return;
    releaseDetailInterest = store.acquireDetailInterest(input.value);
  }

  function refresh(): Promise<void> {
    if (!input.value.proposalId) return Promise.resolve();
    return store.loadDetail(input.value);
  }

  async function openDetail(): Promise<void> {
    open.value = true;
    await refresh();
  }

  function confirm(persist: WorkflowProposalPersist): Promise<WorkflowProposalConfirmResult> {
    if (!input.value.proposalId) return Promise.resolve({ status: "cancelled" });
    return store.confirm({ ...input.value, persist });
  }

  function cancel() {
    if (!input.value.proposalId) return Promise.resolve({ status: "cancelled" } as const);
    return store.cancel(input.value);
  }

  function closeDetail(): void {
    open.value = false;
    stopDetailInterest();
  }

  watch(open, (isOpen) => {
    if (isOpen) startDetailInterest();
    else stopDetailInterest();
  });
  watch(
    input,
    () => {
      if (open.value) startDetailInterest();
    },
    { deep: true }
  );
  onBeforeUnmount(stopDetailInterest);

  return { open, input, state, detail, refresh, openDetail, closeDetail, confirm, cancel };
}

export function useWorkflowProposalListInterest(
  input: MaybeRefOrGetter<{ workspaceId: string; parentSessionId: string }>
): void {
  const store = useWorkflowProposalStore();
  let release: (() => void) | null = null;

  function reset(): void {
    release?.();
    release = store.acquireListInterest(toValue(input));
  }

  watch(() => toValue(input), reset, { immediate: true, deep: true });
  onBeforeUnmount(() => release?.());
}
