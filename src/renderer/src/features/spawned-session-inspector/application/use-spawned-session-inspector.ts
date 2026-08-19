import { computed, onBeforeUnmount, ref, watch, type MaybeRefOrGetter } from "vue";
import { toValue } from "vue";
import { useSpawnedSessionStore } from "@renderer/stores";

export interface SpawnedSessionInspectorTarget {
  workspaceId: MaybeRefOrGetter<string>;
  parentSessionId: MaybeRefOrGetter<string>;
  sessionId: MaybeRefOrGetter<string>;
}

export function useSpawnedSessionInspector(target: SpawnedSessionInspectorTarget) {
  const store = useSpawnedSessionStore();
  const open = ref(false);
  const input = computed(() => ({
    workspaceId: toValue(target.workspaceId),
    parentSessionId: toValue(target.parentSessionId),
    sessionId: toValue(target.sessionId),
  }));
  const state = computed(() =>
    store.detailState(input.value.workspaceId, input.value.parentSessionId, input.value.sessionId)
  );
  const detail = computed(() =>
    state.value.result?.status === "ready" ? state.value.result : null
  );
  let releaseDetailInterest: (() => void) | null = null;

  function stopDetailInterest(): void {
    releaseDetailInterest?.();
    releaseDetailInterest = null;
  }

  function startDetailInterest(): void {
    stopDetailInterest();
    releaseDetailInterest = store.acquireDetailInterest(input.value);
  }

  function refresh(): Promise<void> {
    return store.loadDetail(input.value);
  }

  async function openDetail(): Promise<void> {
    open.value = true;
    await refresh();
  }

  function closeDetail(): void {
    open.value = false;
  }

  watch(open, (isOpen) => {
    if (isOpen) {
      startDetailInterest();
    } else {
      stopDetailInterest();
    }
  });
  watch(input, () => {
    if (open.value) startDetailInterest();
  });
  onBeforeUnmount(stopDetailInterest);

  return { open, state, detail, refresh, openDetail, closeDetail };
}
