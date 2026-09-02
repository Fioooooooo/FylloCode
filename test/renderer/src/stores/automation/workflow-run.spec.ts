import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import type { WorkflowRunDetail, WorkflowRunSummary } from "@shared/types/workflow";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  getDetail: vi.fn(),
  decide: vi.fn(),
}));

vi.mock("@renderer/api/automation/workflow-run", () => ({
  workflowRunApi: {
    list: mocks.list,
    getDetail: mocks.getDetail,
    decide: mocks.decide,
    onWake: vi.fn(),
  },
}));

import { useWorkflowRunStore } from "@renderer/stores/automation/workflow-run";

const owner = { workspaceId: "workspace-1", parentSessionId: "parent-1" };

function summary(overrides: Partial<WorkflowRunSummary> = {}): WorkflowRunSummary {
  return {
    runId: "run-1",
    workflowId: "workflow-1",
    workflowName: "Demo Workflow",
    parentSessionId: owner.parentSessionId,
    status: "awaiting_gate_decision",
    currentStageId: "review",
    pendingDecision: { kind: "gate", prompt: "Review output" },
    createdAt: "2026-08-20T00:00:00.000Z",
    updatedAt: "2026-08-20T00:01:00.000Z",
    ...overrides,
  };
}

function detail(overrides: Partial<WorkflowRunDetail> = {}): WorkflowRunDetail {
  return {
    ...summary(),
    visitCounts: { review: 1 },
    artifacts: { result: "ready" },
    agentSessionState: { sessionId: "workflow-session-1" },
    transcript: "agent output",
    ...overrides,
  };
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  mocks.list.mockResolvedValue({ ok: true, data: { runs: [] } satisfies { runs: [] } });
  mocks.getDetail.mockResolvedValue({ ok: true, data: detail() });
  mocks.decide.mockResolvedValue({
    ok: true,
    data: detail({ status: "running", pendingDecision: undefined }),
  });
});

describe("workflow-run store", () => {
  it("does not pull details for a wake when no Run has interest", async () => {
    const store = useWorkflowRunStore();

    await store.handleWake({ workspaceId: owner.workspaceId, runId: "run-1" });

    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.getDetail).not.toHaveBeenCalled();
  });

  it("pulls only an interested matching Run and keeps list/detail projections separate from spawned state", async () => {
    const store = useWorkflowRunStore();
    const releaseList = store.acquireListInterest(owner);
    const releaseDetail = store.acquireDetailInterest({ ...owner, runId: "run-1" });
    await vi.waitFor(() => expect(mocks.getDetail).toHaveBeenCalledTimes(1));
    mocks.list.mockClear();
    mocks.getDetail.mockClear();

    await store.handleWake({ workspaceId: owner.workspaceId, runId: "other-run" });
    expect(mocks.list).toHaveBeenCalledTimes(1);
    expect(mocks.getDetail).not.toHaveBeenCalled();

    mocks.list.mockClear();
    await store.handleWake({ workspaceId: owner.workspaceId, runId: "run-1" });
    expect(mocks.list).toHaveBeenCalledTimes(1);
    expect(mocks.getDetail).toHaveBeenCalledWith({ ...owner, runId: "run-1" });

    releaseDetail();
    releaseList();
  });

  it("drops a late detail response after the owner generation changes", async () => {
    let resolveDetail!: (value: { ok: true; data: WorkflowRunDetail }) => void;
    mocks.getDetail.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveDetail = resolve;
      })
    );
    const store = useWorkflowRunStore();
    const release = store.acquireDetailInterest({ ...owner, runId: "run-1" });
    expect(mocks.getDetail).toHaveBeenCalledOnce();

    store.resetWorkspace(owner.workspaceId);
    resolveDetail({ ok: true, data: detail({ transcript: "stale" }) });
    await Promise.resolve();
    await Promise.resolve();

    expect(store.detailState(owner.workspaceId, owner.parentSessionId, "run-1").result).toBeNull();
    release();
  });

  it("routes approve/reject through one decision API and updates the detail projection", async () => {
    const store = useWorkflowRunStore();
    const result = await store.decide({ ...owner, runId: "run-1", decision: "approve" });

    expect(result?.status).toBe("running");
    expect(mocks.decide).toHaveBeenCalledWith({
      ...owner,
      runId: "run-1",
      decision: "approve",
    });
    expect(
      store.detailState(owner.workspaceId, owner.parentSessionId, "run-1").result?.status
    ).toBe("running");
  });

  it("uses a ref-count so a wake stops pulling only after the last interest is released", async () => {
    mocks.getDetail.mockClear();
    const store = useWorkflowRunStore();
    const input = { ...owner, runId: "run-1" };
    const first = store.acquireDetailInterest(input);
    const second = store.acquireDetailInterest(input);
    await vi.waitFor(() => expect(mocks.getDetail).toHaveBeenCalledTimes(1));
    mocks.getDetail.mockClear();

    first();
    await store.handleWake({ workspaceId: owner.workspaceId, runId: "run-1" });
    expect(mocks.getDetail).toHaveBeenCalledTimes(1);
    mocks.getDetail.mockClear();

    second();
    await store.handleWake({ workspaceId: owner.workspaceId, runId: "run-1" });
    expect(mocks.getDetail).not.toHaveBeenCalled();
  });
});
