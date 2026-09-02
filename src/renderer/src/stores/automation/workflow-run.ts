import { ref } from "vue";
import { defineStore } from "pinia";
import { workflowRunApi } from "@renderer/api/automation/workflow-run";
import type {
  WorkflowRunDecisionRequest,
  WorkflowRunDetail,
  WorkflowRunDetailRequest,
  WorkflowRunListRequest,
  WorkflowRunSummary,
  WorkflowRunWakePayload,
} from "@shared/types/workflow";

export interface WorkflowRunListState {
  runs: WorkflowRunSummary[];
  loading: boolean;
  error: string | null;
}

export interface WorkflowRunDetailState {
  result: WorkflowRunDetail | null;
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

function ownerKey(workspaceId: string, parentSessionId: string): string {
  return `${workspaceId}\0${parentSessionId}`;
}

function runKey(workspaceId: string, parentSessionId: string, runId: string): string {
  return `${ownerKey(workspaceId, parentSessionId)}\0${runId}`;
}

function errorFromResponse(message: string, code?: string): Error & { code?: string } {
  return Object.assign(new Error(message), code ? { code } : {});
}

function sameRun(left: WorkflowRunSummary, right: WorkflowRunSummary): boolean {
  return left.runId === right.runId;
}

export const useWorkflowRunStore = defineStore("workflow-run", () => {
  const lists = ref(new Map<string, WorkflowRunListState>());
  const details = ref(new Map<string, WorkflowRunDetailState>());
  const generations = new Map<string, number>();
  const listInFlight = new Map<string, ListRequestState>();
  const detailInFlight = new Map<string, DetailRequestState>();
  const listInterests = new Map<string, number>();
  const detailInterests = new Map<string, number>();
  const listInputs = new Map<string, WorkflowRunListRequest>();
  const detailInputs = new Map<string, WorkflowRunDetailRequest>();

  function generation(key: string): number {
    return generations.get(key) ?? 0;
  }

  function replaceList(key: string, state: WorkflowRunListState): void {
    const next = new Map(lists.value);
    next.set(key, state);
    lists.value = next;
  }

  function replaceDetail(key: string, state: WorkflowRunDetailState): void {
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

  function updateListSummary(input: WorkflowRunDetailRequest, detail: WorkflowRunDetail): void {
    const key = ownerKey(input.workspaceId, input.parentSessionId);
    const current = lists.value.get(key);
    if (!current) return;
    const nextRuns = current.runs.map((summary) =>
      sameRun(summary, detail)
        ? {
            runId: detail.runId,
            workflowId: detail.workflowId,
            workflowName: detail.workflowName,
            parentSessionId: detail.parentSessionId,
            status: detail.status,
            currentStageId: detail.currentStageId,
            ...(detail.pendingDecision ? { pendingDecision: detail.pendingDecision } : {}),
            ...(detail.error ? { error: detail.error } : {}),
            createdAt: detail.createdAt,
            updatedAt: detail.updatedAt,
          }
        : summary
    );
    if (nextRuns.some((summary, index) => summary !== current.runs[index])) {
      replaceList(key, { ...current, runs: nextRuns });
    }
  }

  async function executeList(
    input: WorkflowRunListRequest,
    key: string,
    requestGeneration: number
  ): Promise<void> {
    if (generation(key) !== requestGeneration) return;
    const current = lists.value.get(key);
    replaceList(key, { runs: current?.runs ?? [], loading: true, error: null });
    try {
      const response = await workflowRunApi.list(input);
      if (generation(key) !== requestGeneration) return;
      if (!response.ok) throw errorFromResponse(response.error.message, response.error.code);
      replaceList(key, { runs: response.data.runs, loading: false, error: null });
    } catch (error: unknown) {
      if (generation(key) !== requestGeneration) return;
      replaceList(key, {
        runs: lists.value.get(key)?.runs ?? [],
        loading: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  function startList(input: WorkflowRunListRequest, queueIfInFlight: boolean): Promise<void> {
    const key = ownerKey(input.workspaceId, input.parentSessionId);
    listInputs.set(key, input);
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
    input: WorkflowRunDetailRequest,
    key: string,
    requestGeneration: number
  ): Promise<void> {
    if (generation(key) !== requestGeneration) return;
    const current = details.value.get(key);
    replaceDetail(key, { result: current?.result ?? null, loading: true, error: null });
    try {
      const response = await workflowRunApi.getDetail(input);
      if (generation(key) !== requestGeneration) return;
      if (!response.ok) throw errorFromResponse(response.error.message, response.error.code);
      replaceDetail(key, { result: response.data, loading: false, error: null });
      updateListSummary(input, response.data);
    } catch (error: unknown) {
      if (generation(key) !== requestGeneration) return;
      replaceDetail(key, {
        result: details.value.get(key)?.result ?? null,
        loading: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  function startDetail(input: WorkflowRunDetailRequest, queueIfInFlight: boolean): Promise<void> {
    const key = runKey(input.workspaceId, input.parentSessionId, input.runId);
    detailInputs.set(key, input);
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

  function loadRuns(input: WorkflowRunListRequest): Promise<void> {
    return startList(input, false);
  }

  function loadDetail(input: WorkflowRunDetailRequest): Promise<void> {
    return startDetail(input, false);
  }

  function acquireListInterest(input: WorkflowRunListRequest): () => void {
    const key = ownerKey(input.workspaceId, input.parentSessionId);
    listInputs.set(key, input);
    const count = listInterests.get(key) ?? 0;
    listInterests.set(key, count + 1);
    if (count === 0) {
      void startList(input, false);
    }

    let released = false;
    return () => {
      if (released) return;
      released = true;
      const current = listInterests.get(key) ?? 0;
      if (current <= 1) {
        listInterests.delete(key);
        generations.set(key, generation(key) + 1);
        const inFlight = listInFlight.get(key);
        if (inFlight) {
          inFlight.queued = false;
          listInFlight.delete(key);
        }
      } else {
        listInterests.set(key, current - 1);
      }
    };
  }

  function acquireDetailInterest(input: WorkflowRunDetailRequest): () => void {
    const key = runKey(input.workspaceId, input.parentSessionId, input.runId);
    detailInputs.set(key, input);
    const count = detailInterests.get(key) ?? 0;
    detailInterests.set(key, count + 1);
    if (count === 0) {
      void startDetail(input, false);
    }

    let released = false;
    return () => {
      if (released) return;
      released = true;
      const current = detailInterests.get(key) ?? 0;
      if (current <= 1) {
        detailInterests.delete(key);
        generations.set(key, generation(key) + 1);
        const inFlight = detailInFlight.get(key);
        if (inFlight) {
          inFlight.queued = false;
          detailInFlight.delete(key);
        }
      } else {
        detailInterests.set(key, current - 1);
      }
    };
  }

  async function decide(input: WorkflowRunDecisionRequest): Promise<WorkflowRunDetail | null> {
    const key = runKey(input.workspaceId, input.parentSessionId, input.runId);
    // 不将 decision 请求存储为 detailInputs，因为它包含额外的 decision 字段
    const detailRequest: WorkflowRunDetailRequest = {
      workspaceId: input.workspaceId,
      parentSessionId: input.parentSessionId,
      runId: input.runId,
    };
    const requestGeneration = generation(key);
    const current = details.value.get(key);
    replaceDetail(key, { result: current?.result ?? null, loading: true, error: null });
    try {
      const response = await workflowRunApi.decide(input);
      if (generation(key) !== requestGeneration) return null;
      if (!response.ok) throw errorFromResponse(response.error.message, response.error.code);
      replaceDetail(key, { result: response.data, loading: false, error: null });
      updateListSummary(detailRequest, response.data);
      return response.data;
    } catch (error: unknown) {
      if (generation(key) !== requestGeneration) return null;
      replaceDetail(key, {
        result: details.value.get(key)?.result ?? null,
        loading: false,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async function handleWake(payload: WorkflowRunWakePayload): Promise<void> {
    const requests: Promise<void>[] = [];
    const workspacePrefix = `${payload.workspaceId}\0`;

    for (const [key, count] of listInterests) {
      if (count <= 0 || !key.startsWith(workspacePrefix)) continue;
      const input = listInputs.get(key);
      if (input) requests.push(startList(input, true));
    }

    for (const [key, count] of detailInterests) {
      if (count <= 0 || !key.startsWith(workspacePrefix)) continue;
      const input = detailInputs.get(key);
      if (input?.runId === payload.runId) requests.push(startDetail(input, true));
    }

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
      ...listInputs.keys(),
      ...detailInputs.keys(),
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
    for (const key of [...listInputs.keys()]) {
      if (key.startsWith(prefix)) listInputs.delete(key);
    }
    for (const key of [...detailInputs.keys()]) {
      if (key.startsWith(prefix)) detailInputs.delete(key);
    }
  }

  function listState(workspaceId: string, parentSessionId: string): WorkflowRunListState {
    return (
      lists.value.get(ownerKey(workspaceId, parentSessionId)) ?? {
        runs: [],
        loading: false,
        error: null,
      }
    );
  }

  function detailState(
    workspaceId: string,
    parentSessionId: string,
    runId: string
  ): WorkflowRunDetailState {
    return (
      details.value.get(runKey(workspaceId, parentSessionId, runId)) ?? {
        result: null,
        loading: false,
        error: null,
      }
    );
  }

  return {
    lists,
    details,
    loadRuns,
    loadDetail,
    decide,
    acquireListInterest,
    acquireDetailInterest,
    handleWake,
    resetWorkspace,
    listState,
    detailState,
  };
});
