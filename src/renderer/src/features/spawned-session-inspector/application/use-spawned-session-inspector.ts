import { computed, onMounted, ref, watch, type MaybeRefOrGetter } from "vue";
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

  onMounted(() => void refresh());
  watch(input, () => void refresh());

  return { open, state, detail, refresh, openDetail, closeDetail };
}
