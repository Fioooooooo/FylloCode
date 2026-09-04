import { ref } from "vue";
import { defineStore } from "pinia";
import { workflowProposalApi } from "@renderer/api/automation/workflow-proposal";
import { useChatStore } from "../session";
import type {
  WorkflowProposalCancelResult,
  WorkflowProposalConfirmRequest,
  WorkflowProposalConfirmResult,
  WorkflowProposalDetail,
  WorkflowProposalDetailRequest,
  WorkflowProposalListRequest,
  WorkflowProposalSummary,
  WorkflowProposalWakePayload,
} from "@shared/types/workflow";

export interface WorkflowProposalListState {
  proposals: WorkflowProposalSummary[];
  loading: boolean;
  error: string | null;
}

export interface WorkflowProposalDetailState {
  result: WorkflowProposalDetail | null;
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

function proposalKey(workspaceId: string, parentSessionId: string, proposalId: string): string {
  return `${ownerKey(workspaceId, parentSessionId)}\0${proposalId}`;
}

function errorFromResponse(message: string, code?: string): Error & { code?: string } {
  return Object.assign(new Error(message), code ? { code } : {});
}

function sameProposal(left: WorkflowProposalSummary, right: WorkflowProposalDetail): boolean {
  return left.proposalId === right.proposalId;
}

function summaryFromDetail(detail: WorkflowProposalDetail): WorkflowProposalSummary {
  return {
    proposalId: detail.proposalId,
    workspaceId: detail.workspaceId,
    parentSessionId: detail.parentSessionId,
    mode: detail.mode,
    ...(detail.targetWorkflowId ? { targetWorkflowId: detail.targetWorkflowId } : {}),
    suggestedPersist: detail.suggestedPersist,
    status: detail.status,
    ...(detail.handoffDelivered === undefined ? {} : { handoffDelivered: detail.handoffDelivered }),
    ...(detail.resolvedWorkflowId ? { resolvedWorkflowId: detail.resolvedWorkflowId } : {}),
    ...(detail.resolvedPersist ? { resolvedPersist: detail.resolvedPersist } : {}),
    createdAt: detail.createdAt,
    updatedAt: detail.updatedAt,
  };
}

export const useWorkflowProposalStore = defineStore("workflow-proposal", () => {
  const lists = ref(new Map<string, WorkflowProposalListState>());
  const details = ref(new Map<string, WorkflowProposalDetailState>());
  const generations = new Map<string, number>();
  const listInFlight = new Map<string, ListRequestState>();
  const detailInFlight = new Map<string, DetailRequestState>();
  const listInterests = new Map<string, number>();
  const detailInterests = new Map<string, number>();
  const listInputs = new Map<string, WorkflowProposalListRequest>();
  const detailInputs = new Map<string, WorkflowProposalDetailRequest>();

  function generation(key: string): number {
    return generations.get(key) ?? 0;
  }

  function replaceList(key: string, state: WorkflowProposalListState): void {
    const next = new Map(lists.value);
    next.set(key, state);
    lists.value = next;
  }

  function replaceDetail(key: string, state: WorkflowProposalDetailState): void {
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

  function updateListSummary(
    input: WorkflowProposalDetailRequest,
    detail: WorkflowProposalDetail
  ): void {
    const key = ownerKey(input.workspaceId, input.parentSessionId);
    const current = lists.value.get(key);
    if (!current) return;
    const nextProposal = summaryFromDetail(detail);
    const proposals = current.proposals.map((summary) =>
      sameProposal(summary, detail) ? nextProposal : summary
    );
    if (proposals.some((proposal, index) => proposal !== current.proposals[index])) {
      replaceList(key, { ...current, proposals });
    }
  }

  async function executeList(
    input: WorkflowProposalListRequest,
    key: string,
    requestGeneration: number
  ): Promise<void> {
    if (generation(key) !== requestGeneration) return;
    const current = lists.value.get(key);
    replaceList(key, { proposals: current?.proposals ?? [], loading: true, error: null });
    try {
      const response = await workflowProposalApi.list(input);
      if (generation(key) !== requestGeneration) return;
      if (!response.ok) throw errorFromResponse(response.error.message, response.error.code);
      replaceList(key, { proposals: response.data.proposals, loading: false, error: null });
    } catch (error: unknown) {
      if (generation(key) !== requestGeneration) return;
      replaceList(key, {
        proposals: lists.value.get(key)?.proposals ?? [],
        loading: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  function startList(input: WorkflowProposalListRequest, queueIfInFlight: boolean): Promise<void> {
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
    input: WorkflowProposalDetailRequest,
    key: string,
    requestGeneration: number
  ): Promise<void> {
    if (generation(key) !== requestGeneration) return;
    const current = details.value.get(key);
    replaceDetail(key, { result: current?.result ?? null, loading: true, error: null });
    try {
      const response = await workflowProposalApi.getDetail(input);
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

  function startDetail(
    input: WorkflowProposalDetailRequest,
    queueIfInFlight: boolean
  ): Promise<void> {
    const key = proposalKey(input.workspaceId, input.parentSessionId, input.proposalId);
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

  function loadProposals(input: WorkflowProposalListRequest): Promise<void> {
    return startList(input, false);
  }

  function loadDetail(input: WorkflowProposalDetailRequest): Promise<void> {
    return startDetail(input, false);
  }

  function acquireListInterest(input: WorkflowProposalListRequest): () => void {
    const key = ownerKey(input.workspaceId, input.parentSessionId);
    listInputs.set(key, input);
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

  function acquireDetailInterest(input: WorkflowProposalDetailRequest): () => void {
    const key = proposalKey(input.workspaceId, input.parentSessionId, input.proposalId);
    detailInputs.set(key, input);
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

  async function confirm(
    input: WorkflowProposalConfirmRequest
  ): Promise<WorkflowProposalConfirmResult> {
    const key = proposalKey(input.workspaceId, input.parentSessionId, input.proposalId);
    const requestGeneration = generation(key);
    const current = details.value.get(key);
    replaceDetail(key, { result: current?.result ?? null, loading: true, error: null });
    try {
      const dispatchResult =
        await useChatStore().dispatchAppOwnedChatTurn<WorkflowProposalConfirmResult>(
          input.workspaceId,
          input.parentSessionId,
          (callbacks) => workflowProposalApi.confirmDispatch(input, callbacks),
          { settleOn: "accepted", acquireLocalTurn: "optional" }
        );
      if (dispatchResult.status !== "accepted" || !dispatchResult.result) {
        throw errorFromResponse(
          `Workflow proposal confirmation was not accepted: ${dispatchResult.status}`
        );
      }
      const response = dispatchResult.result;
      if (generation(key) !== requestGeneration) {
        return response;
      }
      await executeDetail(
        {
          workspaceId: input.workspaceId,
          parentSessionId: input.parentSessionId,
          proposalId: input.proposalId,
        },
        key,
        requestGeneration
      );
      return response;
    } catch (error: unknown) {
      if (generation(key) === requestGeneration) {
        replaceDetail(key, {
          result: details.value.get(key)?.result ?? null,
          loading: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      throw error;
    }
  }

  async function cancel(
    input: WorkflowProposalDetailRequest
  ): Promise<WorkflowProposalCancelResult> {
    const key = proposalKey(input.workspaceId, input.parentSessionId, input.proposalId);
    const requestGeneration = generation(key);
    const current = details.value.get(key);
    replaceDetail(key, { result: current?.result ?? null, loading: true, error: null });
    try {
      const response = await workflowProposalApi.cancel(input);
      if (generation(key) !== requestGeneration) {
        return response.ok ? response.data : { status: "cancelled" };
      }
      if (!response.ok) throw errorFromResponse(response.error.message, response.error.code);
      await executeDetail(input, key, requestGeneration);
      return response.data;
    } catch (error: unknown) {
      if (generation(key) === requestGeneration) {
        replaceDetail(key, {
          result: details.value.get(key)?.result ?? null,
          loading: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      throw error;
    }
  }

  async function handleWake(payload: WorkflowProposalWakePayload): Promise<void> {
    const requests: Promise<void>[] = [];
    const workspacePrefix = `${payload.workspaceId}\0`;
    const owner = ownerKey(payload.workspaceId, payload.parentSessionId);

    if (hasListInterest(owner)) {
      const input = listInputs.get(owner);
      if (input) requests.push(startList(input, true));
    }

    const detailKey = proposalKey(payload.workspaceId, payload.parentSessionId, payload.proposalId);
    if (
      detailInterests.get(detailKey) &&
      detailInputs.has(detailKey) &&
      detailKey.startsWith(workspacePrefix)
    ) {
      const input = detailInputs.get(detailKey);
      if (input) requests.push(startDetail(input, true));
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

  function listState(workspaceId: string, parentSessionId: string): WorkflowProposalListState {
    return (
      lists.value.get(ownerKey(workspaceId, parentSessionId)) ?? {
        proposals: [],
        loading: false,
        error: null,
      }
    );
  }

  function detailState(
    workspaceId: string,
    parentSessionId: string,
    proposalId: string
  ): WorkflowProposalDetailState {
    return (
      details.value.get(proposalKey(workspaceId, parentSessionId, proposalId)) ?? {
        result: null,
        loading: false,
        error: null,
      }
    );
  }

  return {
    lists,
    details,
    loadProposals,
    loadDetail,
    confirm,
    cancel,
    acquireListInterest,
    acquireDetailInterest,
    handleWake,
    resetWorkspace,
    listState,
    detailState,
  };
});
