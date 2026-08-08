import { ref } from "vue";
import { defineStore } from "pinia";
import type {
  SpawnedSessionDetailResult,
  SpawnedSessionSummary,
  SpawnedSessionWakePayload,
} from "@shared/ipc/session/spawned-session.schemas";
import { spawnedSessionApi } from "@renderer/api/session/spawned-session";

export interface SpawnedSessionListState {
  items: SpawnedSessionSummary[];
  loading: boolean;
  error: string | null;
}

export interface SpawnedSessionDetailState {
  result: SpawnedSessionDetailResult | null;
  loading: boolean;
  error: string | null;
}

function parentKey(workspaceId: string, parentSessionId: string): string {
  return `${workspaceId}\0${parentSessionId}`;
}

function detailKey(workspaceId: string, parentSessionId: string, sessionId: string): string {
  return `${parentKey(workspaceId, parentSessionId)}\0${sessionId}`;
}

export const useSpawnedSessionStore = defineStore("spawned-session", () => {
  const lists = ref(new Map<string, SpawnedSessionListState>());
  const details = ref(new Map<string, SpawnedSessionDetailState>());
  const generations = new Map<string, number>();
  const listInFlight = new Map<string, Promise<void>>();
  const detailInFlight = new Map<string, Promise<void>>();

  function generation(key: string): number {
    return generations.get(key) ?? 0;
  }

  function replaceList(key: string, state: SpawnedSessionListState): void {
    const next = new Map(lists.value);
    next.set(key, state);
    lists.value = next;
  }

  function replaceDetail(key: string, state: SpawnedSessionDetailState): void {
    const next = new Map(details.value);
    next.set(key, state);
    details.value = next;
  }

  function loadParentSessions(input: {
    workspaceId: string;
    parentSessionId: string;
  }): Promise<void> {
    const key = parentKey(input.workspaceId, input.parentSessionId);
    const existing = listInFlight.get(key);
    if (existing) return existing;
    const requestGeneration = generation(key);
    const current = lists.value.get(key);
    replaceList(key, { items: current?.items ?? [], loading: true, error: null });
    const request = spawnedSessionApi
      .list(input)
      .then((response) => {
        if (generation(key) !== requestGeneration) return;
        if (!response.ok) throw new Error(response.error.message);
        replaceList(key, { items: response.data, loading: false, error: null });
      })
      .catch((error: unknown) => {
        if (generation(key) !== requestGeneration) return;
        replaceList(key, {
          items: lists.value.get(key)?.items ?? [],
          loading: false,
          error: error instanceof Error ? error.message : String(error),
        });
      })
      .finally(() => {
        if (listInFlight.get(key) === request) listInFlight.delete(key);
      });
    listInFlight.set(key, request);
    return request;
  }

  function loadDetail(input: {
    workspaceId: string;
    parentSessionId: string;
    sessionId: string;
  }): Promise<void> {
    const key = detailKey(input.workspaceId, input.parentSessionId, input.sessionId);
    const existing = detailInFlight.get(key);
    if (existing) return existing;
    const requestGeneration = generation(key);
    const current = details.value.get(key);
    replaceDetail(key, { result: current?.result ?? null, loading: true, error: null });
    const request = spawnedSessionApi
      .getDetail(input)
      .then((response) => {
        if (generation(key) !== requestGeneration) return;
        if (!response.ok) throw new Error(response.error.message);
        replaceDetail(key, { result: response.data, loading: false, error: null });
      })
      .catch((error: unknown) => {
        if (generation(key) !== requestGeneration) return;
        replaceDetail(key, {
          result: details.value.get(key)?.result ?? null,
          loading: false,
          error: error instanceof Error ? error.message : String(error),
        });
      })
      .finally(() => {
        if (detailInFlight.get(key) === request) detailInFlight.delete(key);
      });
    detailInFlight.set(key, request);
    return request;
  }

  async function handleWake(payload: SpawnedSessionWakePayload): Promise<void> {
    const listPromise = loadParentSessions(payload);
    const key = detailKey(payload.workspaceId, payload.parentSessionId, payload.sessionId);
    await Promise.all([listPromise, ...(details.value.has(key) ? [loadDetail(payload)] : [])]);
  }

  function resetWorkspace(workspaceId: string): void {
    const prefix = `${workspaceId}\0`;
    for (const key of [...lists.value.keys(), ...details.value.keys()]) {
      if (key.startsWith(prefix)) generations.set(key, generation(key) + 1);
    }
    lists.value = new Map([...lists.value].filter(([key]) => !key.startsWith(prefix)));
    details.value = new Map([...details.value].filter(([key]) => !key.startsWith(prefix)));
  }

  function listState(workspaceId: string, parentSessionId: string): SpawnedSessionListState {
    return (
      lists.value.get(parentKey(workspaceId, parentSessionId)) ?? {
        items: [],
        loading: false,
        error: null,
      }
    );
  }

  function detailState(
    workspaceId: string,
    parentSessionId: string,
    sessionId: string
  ): SpawnedSessionDetailState {
    return (
      details.value.get(detailKey(workspaceId, parentSessionId, sessionId)) ?? {
        result: null,
        loading: false,
        error: null,
      }
    );
  }

  function activeBackgroundForParent(
    workspaceId: string,
    parentSessionId: string
  ): SpawnedSessionSummary[] {
    return listState(workspaceId, parentSessionId).items.filter(
      (item) =>
        item.mode === "background" && (item.status === "starting" || item.status === "running")
    );
  }

  return {
    lists,
    details,
    loadParentSessions,
    loadDetail,
    handleWake,
    resetWorkspace,
    listState,
    detailState,
    activeBackgroundForParent,
  };
});
