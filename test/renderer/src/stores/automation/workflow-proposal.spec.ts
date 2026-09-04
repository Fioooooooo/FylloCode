import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import type { WorkflowProposalDetail, WorkflowProposalSummary } from "@shared/types/workflow";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  getDetail: vi.fn(),
  confirm: vi.fn(),
  confirmDispatch: vi.fn(),
  cancel: vi.fn(),
}));

vi.mock("@renderer/api/automation/workflow-proposal", () => ({
  workflowProposalApi: {
    list: mocks.list,
    getDetail: mocks.getDetail,
    confirm: mocks.confirm,
    confirmDispatch: mocks.confirmDispatch,
    cancel: mocks.cancel,
    onWake: vi.fn(),
    decisionList: vi.fn(),
    decisionDispatch: vi.fn(),
    onDecisionWake: vi.fn(),
  },
}));

import { useWorkflowProposalStore } from "@renderer/stores/automation/workflow-proposal";

const owner = { workspaceId: "workspace-1", parentSessionId: "parent-1" };

function summary(overrides: Partial<WorkflowProposalSummary> = {}): WorkflowProposalSummary {
  return {
    proposalId: "proposal-1",
    workspaceId: owner.workspaceId,
    parentSessionId: owner.parentSessionId,
    mode: "create",
    suggestedPersist: "session",
    status: "pending",
    createdAt: "2026-08-20T00:00:00.000Z",
    updatedAt: "2026-08-20T00:01:00.000Z",
    ...overrides,
  };
}

function detail(overrides: Partial<WorkflowProposalDetail> = {}): WorkflowProposalDetail {
  return {
    ...summary(),
    yaml: "version: 2\nname: Demo",
    definition: {
      version: 2,
      name: "Demo",
      stages: [
        {
          id: "review",
          kind: "agent",
          prompt: "Review",
          produces: { id: "result", schema: "freeform" },
        },
      ],
    },
    ...overrides,
  };
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  mocks.list.mockResolvedValue({ ok: true, data: { proposals: [summary()] } });
  mocks.getDetail.mockResolvedValue({ ok: true, data: detail() });
  mocks.confirm.mockResolvedValue({
    ok: true,
    data: { status: "confirmed", workflowId: "workflow-1", persist: "session" },
  });
  mocks.confirmDispatch.mockImplementation((_input, callbacks) => {
    callbacks.onAccepted({ status: "confirmed", workflowId: "workflow-1", persist: "workspace" });
    return vi.fn();
  });
  mocks.cancel.mockResolvedValue({ ok: true, data: { status: "cancelled" } });
});

describe("workflow-proposal store", () => {
  it("does not pull a wake when no proposal view has interest", async () => {
    const store = useWorkflowProposalStore();

    await store.handleWake({ ...owner, proposalId: "proposal-1" });

    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.getDetail).not.toHaveBeenCalled();
  });

  it("pulls the interested list and detail on first acquisition", async () => {
    const store = useWorkflowProposalStore();
    const releaseList = store.acquireListInterest(owner);
    const releaseDetail = store.acquireDetailInterest({ ...owner, proposalId: "proposal-1" });

    await vi.waitFor(() => {
      expect(mocks.list).toHaveBeenCalledWith(owner);
      expect(mocks.getDetail).toHaveBeenCalledWith({ ...owner, proposalId: "proposal-1" });
    });
    expect(store.listState(owner.workspaceId, owner.parentSessionId).proposals).toEqual([
      summary(),
    ]);
    expect(
      store.detailState(owner.workspaceId, owner.parentSessionId, "proposal-1").result
    ).toEqual(detail());

    releaseDetail();
    releaseList();
  });

  it("pulls only the matching interested list or detail after a wake", async () => {
    const store = useWorkflowProposalStore();
    const releaseList = store.acquireListInterest(owner);
    const releaseDetail = store.acquireDetailInterest({ ...owner, proposalId: "proposal-1" });
    await vi.waitFor(() => expect(mocks.getDetail).toHaveBeenCalledTimes(1));
    mocks.list.mockClear();
    mocks.getDetail.mockClear();

    await store.handleWake({ ...owner, proposalId: "other-proposal" });
    expect(mocks.list).toHaveBeenCalledTimes(1);
    expect(mocks.getDetail).not.toHaveBeenCalled();

    mocks.list.mockClear();
    await store.handleWake({ ...owner, proposalId: "proposal-1" });
    expect(mocks.list).toHaveBeenCalledTimes(1);
    expect(mocks.getDetail).toHaveBeenCalledWith({ ...owner, proposalId: "proposal-1" });

    releaseDetail();
    releaseList();
  });

  it("discards a late response after detail interest is released", async () => {
    let resolveDetail!: (value: { ok: true; data: WorkflowProposalDetail }) => void;
    mocks.getDetail.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveDetail = resolve;
      })
    );
    const store = useWorkflowProposalStore();
    const release = store.acquireDetailInterest({ ...owner, proposalId: "proposal-1" });
    expect(mocks.getDetail).toHaveBeenCalledOnce();

    release();
    resolveDetail({ ok: true, data: detail({ yaml: "stale" }) });
    await Promise.resolve();
    await Promise.resolve();

    expect(
      store.detailState(owner.workspaceId, owner.parentSessionId, "proposal-1").result
    ).toBeNull();
  });

  it("discards a late list response after the workspace is reset", async () => {
    let resolveList!: (value: { ok: true; data: { proposals: WorkflowProposalSummary[] } }) => void;
    mocks.list.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveList = resolve;
      })
    );
    const store = useWorkflowProposalStore();
    const release = store.acquireListInterest(owner);
    expect(mocks.list).toHaveBeenCalledOnce();

    store.resetWorkspace(owner.workspaceId);
    resolveList({ ok: true, data: { proposals: [summary()] } });
    await Promise.resolve();
    await Promise.resolve();

    expect(store.listState(owner.workspaceId, owner.parentSessionId).proposals).toEqual([]);
    release();
  });

  it("confirms through confirmDispatch once and returns its accepted result", async () => {
    const store = useWorkflowProposalStore();
    const release = store.acquireDetailInterest({ ...owner, proposalId: "proposal-1" });
    await vi.waitFor(() => expect(mocks.getDetail).toHaveBeenCalledOnce());

    const result = await store.confirm({
      ...owner,
      proposalId: "proposal-1",
      persist: "workspace",
    });

    expect(result).toEqual({
      status: "confirmed",
      workflowId: "workflow-1",
      persist: "workspace",
    });
    expect(mocks.confirmDispatch).toHaveBeenCalledWith(
      {
        ...owner,
        proposalId: "proposal-1",
        persist: "workspace",
      },
      expect.any(Object)
    );
    expect(mocks.confirm).not.toHaveBeenCalled();
    expect(mocks.getDetail).toHaveBeenCalledTimes(2);
    release();
  });
});
