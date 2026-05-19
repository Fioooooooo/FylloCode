import { mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join, resolve } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProposalMeta } from "@shared/types/proposal";
import type { WorkflowTemplate } from "@shared/types/workflow";

const { tempRoot, mocks } = vi.hoisted(() => ({
  tempRoot: `/private/tmp/fyllocode-apply-run-service-${Math.random().toString(36).slice(2)}`,
  mocks: {
    findProposalMetaById: vi.fn(),
    loadAllWorkflowTemplates: vi.fn(),
    loadProject: vi.fn(),
    newRunId: vi.fn(),
    resolveChangeDir: vi.fn(),
  },
}));

vi.mock("@main/infra/paths", () => ({
  getDataSubPath: vi.fn((subPath: string) => `${tempRoot}/${subPath}`),
}));

vi.mock("@main/infra/storage/project-store", () => ({
  loadProject: mocks.loadProject,
}));

vi.mock("@main/services/workflow/workflow-service", () => ({
  loadAllWorkflowTemplates: mocks.loadAllWorkflowTemplates,
}));

vi.mock("@main/infra/ids", () => ({
  newRunId: mocks.newRunId,
}));

vi.mock("@main/domain/proposal/openspec-reader", async () => {
  const actual = await vi.importActual<typeof import("@main/domain/proposal/openspec-reader")>(
    "@main/domain/proposal/openspec-reader"
  );
  return {
    ...actual,
    findProposalMetaById: mocks.findProposalMetaById,
    resolveChangeDir: mocks.resolveChangeDir,
  };
});

import { applyRunDir, loadApplyRunMeta } from "@main/infra/storage/apply-run-store";
import { createApplyRun } from "@main/services/proposal/apply-run-service";

function workflowTemplate(): WorkflowTemplate {
  return {
    id: "workflow-1",
    name: "Workflow",
    source: "custom",
    yaml: "name: Workflow",
    stages: [{ id: "stage-1", name: "Apply", type: "proposal-apply", agent: "codex" }],
  };
}

function proposalMeta(overrides: Partial<ProposalMeta> = {}): ProposalMeta {
  return {
    id: "change-1",
    title: "Change 1",
    status: "draft",
    why: "Why",
    totalTasks: 1,
    doneTasks: 0,
    hasDesign: false,
    date: "2026-05-19",
    ...overrides,
  };
}

function seedChange(projectPath: string, changeId: string): string {
  const changeDir = join(projectPath, "openspec", "changes", changeId);
  mkdirSync(changeDir, { recursive: true });
  writeFileSync(join(changeDir, ".openspec.yaml"), "schema: spec-driven\nstatus: draft\n", "utf8");
  return changeDir;
}

describe("apply-run-service", () => {
  const projectPath = `${tempRoot}/project`;

  beforeEach(() => {
    rmSync(tempRoot, { recursive: true, force: true });
    vi.clearAllMocks();
    mocks.loadProject.mockResolvedValue({ id: "project-1", path: projectPath });
    mocks.loadAllWorkflowTemplates.mockResolvedValue([workflowTemplate()]);
    mocks.newRunId.mockReturnValue("run-1");
    mocks.resolveChangeDir.mockImplementation(async (_projectPath: string, changeId: string) =>
      join(projectPath, "openspec", "changes", changeId)
    );
  });

  afterEach(() => {
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it("omits worktreePath from run.json when proposal meta does not provide it", async () => {
    seedChange(projectPath, "change-1");
    mocks.findProposalMetaById.mockResolvedValue(proposalMeta({ worktreePath: undefined }));

    await createApplyRun({
      projectId: "project-1",
      changeId: "change-1",
      workflowId: "workflow-1",
    });

    const persisted = readFileSync(join(applyRunDir(projectPath, "change-1"), "run.json"), "utf8");
    expect(persisted).not.toContain("worktreePath");
    const runMeta = await loadApplyRunMeta(projectPath, "change-1");
    expect(runMeta?.changeId).toBe("change-1");
    expect(runMeta?.worktreePath).toBeUndefined();
  });

  it("normalizes a trailing slash before persisting worktreePath", async () => {
    seedChange(projectPath, "change-2");
    mocks.findProposalMetaById.mockResolvedValue(
      proposalMeta({ id: "change-2", worktreePath: "/tmp/worktrees/foo/" })
    );

    await createApplyRun({
      projectId: "project-1",
      changeId: "change-2",
      workflowId: "workflow-1",
    });

    await expect(loadApplyRunMeta(projectPath, "change-2")).resolves.toMatchObject({
      changeId: "change-2",
      worktreePath: resolve("/tmp/worktrees/foo/"),
    });
  });

  it("persists an absolute worktreePath without changing its resolved value", async () => {
    const worktreePath = resolve("/tmp/worktrees/bar");
    seedChange(projectPath, "change-3");
    mocks.findProposalMetaById.mockResolvedValue(proposalMeta({ id: "change-3", worktreePath }));

    await createApplyRun({
      projectId: "project-1",
      changeId: "change-3",
      workflowId: "workflow-1",
    });

    const persisted = JSON.parse(
      readFileSync(join(applyRunDir(projectPath, "change-3"), "run.json"), "utf8")
    ) as { worktreePath?: string };
    expect(persisted.worktreePath).toBe(worktreePath);
  });
});
