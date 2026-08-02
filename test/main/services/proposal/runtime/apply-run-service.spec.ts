import { mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProposalMeta } from "@shared/types/proposal";
import type { WorkflowTemplate } from "@shared/types/workflow";

const { tempRoot, mocks } = await vi.hoisted(async () => {
  const { createTestTempRoot } = await import("@test/main/test-temp-root");
  return {
    tempRoot: createTestTempRoot("fyllocode-apply-run-service-"),
    mocks: {
      loadAllWorkflowTemplates: vi.fn(),
      resolveProposalMeta: vi.fn(),
      resolveRepositoryTarget: vi.fn(),
      newRunId: vi.fn(),
    },
  };
});

vi.mock("@main/infra/paths", () => ({
  getDataSubPath: vi.fn((subPath: string) => `${tempRoot}/${subPath}`),
}));
vi.mock("@main/services/automation/workflow/workflow-service", () => ({
  loadAllWorkflowTemplates: mocks.loadAllWorkflowTemplates,
}));
vi.mock("@main/services/proposal/browser/proposal-service", () => ({
  resolveProposalMeta: mocks.resolveProposalMeta,
}));
vi.mock("@main/services/workspace/resolver/workspace-resolver", () => ({
  resolveWorkspace: vi.fn(),
  resolveRepositoryTarget: mocks.resolveRepositoryTarget,
}));
vi.mock("@main/infra/ids", () => ({ newRunId: mocks.newRunId }));

import { loadApplyRunMeta } from "@main/infra/storage/apply-run-store";
import {
  createApplyRun,
  validateApplyRunTarget,
} from "@main/services/proposal/runtime/apply-run-service";

const proposalRef = { folderId: "folder-b", changeId: "change-1" };
const worktreePath = `${tempRoot}/repo-b/.worktrees/change-1`;

function workflowTemplate(): WorkflowTemplate {
  return {
    id: "workflow-1",
    name: "Workflow",
    source: "custom",
    yaml: "name: Workflow",
    stages: [{ id: "stage-1", name: "Apply", type: "proposal-apply", agent: "codex" }],
  };
}

function proposalMeta(): ProposalMeta {
  return {
    id: proposalRef.changeId,
    proposalRef,
    folderName: "Repository B",
    title: "Change 1",
    status: "draft",
    why: "Why",
    totalTasks: 1,
    doneTasks: 0,
    hasDesign: false,
    date: "2026-05-19",
    worktreeMode: "linked",
    worktreePath,
  };
}

beforeEach(() => {
  rmSync(tempRoot, { recursive: true, force: true });
  mkdirSync(join(worktreePath, "openspec", "changes", proposalRef.changeId), {
    recursive: true,
  });
  writeFileSync(
    join(worktreePath, "openspec", "changes", proposalRef.changeId, ".openspec.yaml"),
    "schema: spec-driven\nstatus: draft\n",
    "utf8"
  );
  vi.clearAllMocks();
  mocks.loadAllWorkflowTemplates.mockResolvedValue([workflowTemplate()]);
  mocks.resolveProposalMeta.mockResolvedValue(proposalMeta());
  mocks.resolveRepositoryTarget.mockResolvedValue({
    workspaceId: "workspace-1",
    folderId: proposalRef.folderId,
    worktreePath,
  });
  mocks.newRunId.mockReturnValue("run-1");
});

afterEach(() => rmSync(tempRoot, { recursive: true, force: true }));

describe("apply-run-service", () => {
  it("persists the secondary owner ProposalRef and fixed worktree snapshot", async () => {
    await createApplyRun({ workspaceId: "workspace-1", ...proposalRef, workflowId: "workflow-1" });
    expect(mocks.loadAllWorkflowTemplates).toHaveBeenCalledWith("workspace-1");
    await expect(loadApplyRunMeta("workspace-1", proposalRef)).resolves.toMatchObject({
      runId: "run-1",
      proposalRef,
      worktreePath,
    });
  });

  it("rejects a stale fixed target without resolving another proposal location", async () => {
    mocks.resolveRepositoryTarget.mockRejectedValue(new Error("worktree removed"));
    await expect(
      validateApplyRunTarget("workspace-1", proposalRef, {
        ...(await loadApplyRunMeta("workspace-1", proposalRef))!,
        runId: "run-1",
        proposalRef,
        worktreePath,
        workflowId: "workflow-1",
        stages: [],
        currentStageIndex: 0,
        stageAcpSessionIds: {},
        status: "running",
        startedAt: "now",
        updatedAt: "now",
      })
    ).rejects.toMatchObject({ code: "PROPOSAL_NOT_FOUND" });
    expect(mocks.resolveProposalMeta).not.toHaveBeenCalled();
  });

  it("rejects an ownerless historical run", async () => {
    const legacy = {
      runId: "legacy",
      workflowId: "workflow-1",
      stages: [],
      currentStageIndex: 0,
      stageAcpSessionIds: {},
      status: "running",
      startedAt: "now",
      updatedAt: "now",
    } as never;
    await expect(validateApplyRunTarget("workspace-1", proposalRef, legacy)).rejects.toMatchObject({
      code: "APPLY_RUN_NOT_READY",
    });
  });
});
