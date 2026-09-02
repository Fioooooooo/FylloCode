import { computed, onBeforeUnmount, ref, toValue, watch, type MaybeRefOrGetter } from "vue";
import { useWorkflowRunStore } from "@renderer/stores";
import type { WorkflowRunDetail, WorkflowRunDecisionRequest } from "@shared/types/workflow";

export interface WorkflowRunInspectorTarget {
  workspaceId: MaybeRefOrGetter<string>;
  parentSessionId: MaybeRefOrGetter<string>;
  runId: MaybeRefOrGetter<string>;
}

export function useWorkflowRunInspector(target: WorkflowRunInspectorTarget) {
  const store = useWorkflowRunStore();
  const open = ref(false);
  const input = computed(() => ({
    workspaceId: toValue(target.workspaceId),
    parentSessionId: toValue(target.parentSessionId),
    runId: toValue(target.runId),
  }));
  const state = computed(() =>
    store.detailState(input.value.workspaceId, input.value.parentSessionId, input.value.runId)
  );
  const detail = computed(() => state.value.result);
  let releaseDetailInterest: (() => void) | null = null;

  function stopDetailInterest(): void {
    releaseDetailInterest?.();
    releaseDetailInterest = null;
  }

  function startDetailInterest(): void {
    stopDetailInterest();
    if (!input.value.runId) return;
    releaseDetailInterest = store.acquireDetailInterest(input.value);
  }

  function refresh(): Promise<void> {
    if (!input.value.runId) return Promise.resolve();
    return store.loadDetail(input.value);
  }

  async function openDetail(): Promise<void> {
    open.value = true;
    await refresh();
  }

  function decide(
    decision: WorkflowRunDecisionRequest["decision"]
  ): Promise<WorkflowRunDetail | null> {
    if (!input.value.runId) return Promise.resolve(null);
    return store.decide({ ...input.value, decision });
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
      if (open.value) {
        startDetailInterest();
      }
    },
    { deep: true }
  );
  onBeforeUnmount(stopDetailInterest);

  return { open, input, state, detail, refresh, openDetail, closeDetail, decide };
}

export function useWorkflowRunListInterest(
  input: MaybeRefOrGetter<{
    workspaceId: string;
    parentSessionId: string;
  }>
): void {
  const store = useWorkflowRunStore();
  let release: (() => void) | null = null;

  function reset(): void {
    release?.();
    release = store.acquireListInterest(toValue(input));
  }

  watch(() => toValue(input), reset, { immediate: true, deep: true });
  onBeforeUnmount(() => release?.());
}
