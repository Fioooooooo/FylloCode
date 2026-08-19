import { ref } from "vue";
import { defineStore } from "pinia";
import type {
  SpawnedSessionDetailInput,
  SpawnedSessionDetailResult,
  SpawnedSessionListInput,
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

interface ListRequestState {
  generation: number;
  queued: boolean;
  promise: Promise<void>;
}

interface DetailRequestState {
  generation: number;
  queued: boolean;
  promise: Promise<void>;
}

function parentKey(workspaceId: string, parentSessionId: string): string {
  return `${workspaceId}\0${parentSessionId}`;
}

function detailKey(workspaceId: string, parentSessionId: string, sessionId: string): string {
  return `${parentKey(workspaceId, parentSessionId)}\0${sessionId}`;
}

function scopeFromInput(input: SpawnedSessionListInput): string {
  return parentKey(input.workspaceId, input.parentSessionId);
}

export const useSpawnedSessionStore = defineStore("spawned-session", () => {
  const lists = ref(new Map<string, SpawnedSessionListState>());
  const details = ref(new Map<string, SpawnedSessionDetailState>());
  const generations = new Map<string, number>();
  const listInFlight = new Map<string, ListRequestState>();
  const detailInFlight = new Map<string, DetailRequestState>();
  const listInterests = new Map<string, number>();
  const detailInterests = new Map<string, number>();

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

  function hasListInterest(key: string): boolean {
    return (listInterests.get(key) ?? 0) > 0;
  }

  function hasDetailInterest(key: string): boolean {
    return (detailInterests.get(key) ?? 0) > 0;
  }

  async function executeList(
    input: SpawnedSessionListInput,
    key: string,
    requestGeneration: number
  ) {
    if (generation(key) !== requestGeneration) return;
    const current = lists.value.get(key);
    replaceList(key, { items: current?.items ?? [], loading: true, error: null });
    try {
      const response = await spawnedSessionApi.list(input);
      if (generation(key) !== requestGeneration) return;
      if (!response.ok) throw new Error(response.error.message);
      replaceList(key, { items: response.data, loading: false, error: null });
    } catch (error: unknown) {
      if (generation(key) !== requestGeneration) return;
      replaceList(key, {
        items: lists.value.get(key)?.items ?? [],
        loading: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  function startList(input: SpawnedSessionListInput, queueIfInFlight: boolean): Promise<void> {
    const key = scopeFromInput(input);
    const existing = listInFlight.get(key);
    if (existing) {
      if (queueIfInFlight && hasListInterest(key)) existing.queued = true;
      return existing.promise;
    }

    const request: ListRequestState = {
      generation: generation(key),
      queued: false,
      promise: Promise.resolve(),
    };
    request.promise = (async () => {
      do {
        request.queued = false;
        await executeList(input, key, request.generation);
      } while (request.queued && hasListInterest(key) && generation(key) === request.generation);
    })();
    listInFlight.set(key, request);
    void request.promise.finally(() => {
      if (listInFlight.get(key) === request) listInFlight.delete(key);
    });
    return request.promise;
  }

  async function executeDetail(
    input: SpawnedSessionDetailInput,
    key: string,
    requestGeneration: number
  ): Promise<void> {
    if (generation(key) !== requestGeneration) return;
    const current = details.value.get(key);
    replaceDetail(key, { result: current?.result ?? null, loading: true, error: null });
    try {
      const response = await spawnedSessionApi.getDetail(input);
      if (generation(key) !== requestGeneration) return;
      if (!response.ok) throw new Error(response.error.message);
      replaceDetail(key, { result: response.data, loading: false, error: null });
      if (response.data.status === "not_found") {
        detailInterests.delete(key);
        detailInFlight.delete(key);
        generations.set(key, generation(key) + 1);
      }
    } catch (error: unknown) {
      if (generation(key) !== requestGeneration) return;
      replaceDetail(key, {
        result: details.value.get(key)?.result ?? null,
        loading: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  function startDetail(input: SpawnedSessionDetailInput, queueIfInFlight: boolean): Promise<void> {
    const key = detailKey(input.workspaceId, input.parentSessionId, input.sessionId);
    const existing = detailInFlight.get(key);
    if (existing) {
      if (queueIfInFlight && hasDetailInterest(key)) existing.queued = true;
      return existing.promise;
    }

    const request: DetailRequestState = {
      generation: generation(key),
      queued: false,
      promise: Promise.resolve(),
    };
    request.promise = (async () => {
      do {
        request.queued = false;
        await executeDetail(input, key, request.generation);
      } while (request.queued && hasDetailInterest(key) && generation(key) === request.generation);
    })();
    detailInFlight.set(key, request);
    void request.promise.finally(() => {
      if (detailInFlight.get(key) === request) detailInFlight.delete(key);
    });
    return request.promise;
  }

  function loadParentSessions(input: SpawnedSessionListInput): Promise<void> {
    return startList(input, false);
  }

  function loadDetail(input: SpawnedSessionDetailInput): Promise<void> {
    return startDetail(input, false);
  }

  function acquireParentListInterest(input: SpawnedSessionListInput): () => void {
    const key = scopeFromInput(input);
    const count = listInterests.get(key) ?? 0;
    listInterests.set(key, count + 1);
    if (count === 0) void startList(input, false);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const current = listInterests.get(key) ?? 0;
      if (current <= 1) {
        listInterests.delete(key);
      } else {
        listInterests.set(key, current - 1);
      }
      if (!hasListInterest(key)) {
        const inFlight = listInFlight.get(key);
        if (inFlight) inFlight.queued = false;
      }
    };
  }

  function acquireDetailInterest(input: SpawnedSessionDetailInput): () => void {
    const key = detailKey(input.workspaceId, input.parentSessionId, input.sessionId);
    const count = detailInterests.get(key) ?? 0;
    detailInterests.set(key, count + 1);
    if (count === 0) void startDetail(input, false);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const current = detailInterests.get(key) ?? 0;
      if (current <= 1) {
        detailInterests.delete(key);
      } else {
        detailInterests.set(key, current - 1);
      }
      if (!hasDetailInterest(key)) {
        const inFlight = detailInFlight.get(key);
        if (inFlight) inFlight.queued = false;
      }
    };
  }

  async function handleWake(payload: SpawnedSessionWakePayload): Promise<void> {
    const listInput: SpawnedSessionListInput = {
      workspaceId: payload.workspaceId,
      parentSessionId: payload.parentSessionId,
    };
    const detailInput: SpawnedSessionDetailInput = payload;
    const requests: Promise<void>[] = [];
    if (hasListInterest(scopeFromInput(listInput))) requests.push(startList(listInput, true));
    const detailScope = detailKey(
      detailInput.workspaceId,
      detailInput.parentSessionId,
      detailInput.sessionId
    );
    if (hasDetailInterest(detailScope)) requests.push(startDetail(detailInput, true));
    await Promise.all(requests);
  }

  function resetWorkspace(workspaceId: string): void {
    const prefix = `${workspaceId}\0`;
    const keys = new Set([
      ...lists.value.keys(),
      ...details.value.keys(),
      ...listInterests.keys(),
      ...detailInterests.keys(),
      ...listInFlight.keys(),
      ...detailInFlight.keys(),
    ]);
    for (const key of keys) {
      if (key.startsWith(prefix)) generations.set(key, generation(key) + 1);
    }
    lists.value = new Map([...lists.value].filter(([key]) => !key.startsWith(prefix)));
    details.value = new Map([...details.value].filter(([key]) => !key.startsWith(prefix)));
    for (const key of [...listInterests.keys()]) {
      if (key.startsWith(prefix)) listInterests.delete(key);
    }
    for (const key of [...detailInterests.keys()]) {
      if (key.startsWith(prefix)) detailInterests.delete(key);
    }
    for (const key of [...listInFlight.keys()]) {
      if (key.startsWith(prefix)) listInFlight.delete(key);
    }
    for (const key of [...detailInFlight.keys()]) {
      if (key.startsWith(prefix)) detailInFlight.delete(key);
    }
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

  return {
    lists,
    details,
    loadParentSessions,
    loadDetail,
    acquireParentListInterest,
    acquireDetailInterest,
    handleWake,
    resetWorkspace,
    listState,
    detailState,
  };
});
