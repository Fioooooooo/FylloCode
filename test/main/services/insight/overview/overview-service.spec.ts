import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Subject } from "@shared/types/lineage";
import type { ProposalMeta } from "@shared/types/proposal";

const mocks = vi.hoisted(() => ({
  resolveWorkspace: vi.fn(),
  listRegisteredWorktreePaths: vi.fn(),
  readRepositoryProposalFiles: vi.fn(),
  listSubjects: vi.fn(),
  countSpecs: vi.fn(),
  countArchives: vi.fn(),
  countGuidelines: vi.fn(),
  getGitGovernance: vi.fn(),
  buildArchiveCommitIndex: vi.fn(),
}));

vi.mock("@main/services/workspace/_public", () => ({ resolveWorkspace: mocks.resolveWorkspace }));
vi.mock("@main/infra/git/worktree-reader", () => ({
  listRegisteredWorktreePaths: mocks.listRegisteredWorktreePaths,
}));
vi.mock("@main/infra/proposal/openspec-reader", () => ({
  readRepositoryProposalFiles: mocks.readRepositoryProposalFiles,
}));
vi.mock("@main/infra/storage/lineage-store", () => ({ listSubjects: mocks.listSubjects }));
vi.mock("@main/services/insight/overview/openspec-stats", () => ({
  countSpecs: mocks.countSpecs,
  countArchives: mocks.countArchives,
  countGuidelines: mocks.countGuidelines,
}));
vi.mock("@main/services/insight/overview/git-stats", () => ({
  getGitGovernance: mocks.getGitGovernance,
}));
vi.mock("@main/services/insight/overview/archive-commit-index", () => ({
  buildArchiveCommitIndex: mocks.buildArchiveCommitIndex,
}));

import { getProjectOverview } from "@main/services/insight/overview/overview-service";

function proposal(folderId: string, folderName: string, status: ProposalMeta["status"] = "draft") {
  return {
    id: "same-change",
    proposalRef: { folderId, changeId: "same-change" },
    folderName,
    title: `${folderName} change`,
    status,
    why: "",
    totalTasks: 1,
    doneTasks: 0,
    hasDesign: true,
    date: "2026-06-02T00:00:00.000Z",
    worktreeMode: "main" as const,
    worktreePath: `/repo-${folderId.at(-1)}`,
  } satisfies ProposalMeta;
}

function subject(overrides: Partial<Subject> = {}): Subject {
  return {
    id: "subject-1",
    origin: "task",
    task: {
      ref: "local:task-1",
      snapshot: { title: "Current Workspace task" },
      capturedAt: "2026-06-01T00:00:00.000Z",
    } as never,
    links: [
      {
        sessionId: "session-1",
        createdAt: "2026-06-01T00:00:00.000Z",
        proposals: [
          {
            folderId: "folder-a",
            changeId: "same-change",
            createdAt: "2026-06-01T00:00:00.000Z",
          },
        ],
        plans: [],
      },
    ],
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-10T00:00:00.000Z",
    ...overrides,
  };
}

describe("overview-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-12T08:00:00.000Z"));
    mocks.resolveWorkspace.mockResolvedValue({
      workspaceId: "workspace-1",
      primaryFolderId: "folder-a",
      folders: [
        {
          folderId: "folder-a",
          folderName: "A",
          folderPath: "/repo-a",
          pathMissing: false,
        },
        {
          folderId: "folder-b",
          folderName: "B",
          folderPath: "/repo-b",
          pathMissing: false,
        },
      ],
    });
    mocks.listRegisteredWorktreePaths.mockResolvedValue({ paths: [] });
    mocks.readRepositoryProposalFiles.mockImplementation(
      async ({ folderId, folderName }: { folderId: string; folderName: string }) => [
        proposal(folderId, folderName),
      ]
    );
    mocks.listSubjects.mockResolvedValue([subject()]);
    mocks.countSpecs.mockImplementation(async (path: string) => (path === "/repo-a" ? 2 : 3));
    mocks.countArchives.mockResolvedValue({ total: 1, thisMonth: 1 });
    mocks.countGuidelines.mockResolvedValue(2);
    mocks.getGitGovernance.mockImplementation(async (path: string) => ({
      specsGrowth: [
        { weekStart: "2026-06-01T00:00:00.000Z", cumulativeCount: path === "/repo-a" ? 1 : 2 },
      ],
      recentGuidelines: [
        {
          fileName: "Architecture.md",
          lastCommitDate: "2026-06-10T00:00:00.000Z",
          lastCommitMessage: "docs: update",
        },
      ],
      guidelinesLastUpdated: "2026-06-10T00:00:00.000Z",
    }));
    mocks.buildArchiveCommitIndex.mockResolvedValue(new Map());
  });

  it("reads Workspace subjects once and keeps same-name Folder proposals separate", async () => {
    const overview = await getProjectOverview("workspace-1");

    expect(mocks.resolveWorkspace).toHaveBeenCalledTimes(1);
    expect(mocks.resolveWorkspace).toHaveBeenCalledWith("workspace-1");
    expect(mocks.listSubjects).toHaveBeenCalledTimes(1);
    expect(mocks.listSubjects).toHaveBeenCalledWith("workspace-1");
    expect(overview.activeChanges).toHaveLength(2);
    expect(overview.activeChanges.map(({ proposalRef }) => proposalRef)).toEqual([
      { folderId: "folder-a", changeId: "same-change" },
      { folderId: "folder-b", changeId: "same-change" },
    ]);
    expect(overview.activeChanges[0]).toMatchObject({
      folderName: "A",
      taskTitle: "Current Workspace task",
    });
    expect(overview.activeChanges[1]).toMatchObject({ folderName: "B", taskTitle: null });
    expect(overview.stats).toMatchObject({ specsCount: 5, archiveCount: 2, guidelinesCount: 4 });
    expect(overview.repository.completeness).toBe("complete");
    expect(overview.governance.specsGrowth.map(({ folderId }) => folderId)).toEqual([
      "folder-a",
      "folder-b",
    ]);
  });

  it("returns partial repository governance without losing Workspace work", async () => {
    mocks.getGitGovernance.mockImplementation(async (path: string) => {
      if (path === "/repo-b") throw new Error("git failed");
      return {
        specsGrowth: [],
        recentGuidelines: [],
        guidelinesLastUpdated: null,
      };
    });

    const overview = await getProjectOverview("workspace-1");

    expect(overview.repository).toMatchObject({
      completeness: "partial",
      excludedFolderIds: ["folder-b"],
    });
    expect(overview.repository.folders[1]).toMatchObject({ status: "error", error: "git failed" });
    expect(overview.stats.specsCount).toBe(2);
    expect(overview.recentLineages).toHaveLength(1);
  });

  it("keeps a missing secondary Folder visible", async () => {
    const workspace = await mocks.resolveWorkspace();
    workspace.folders[1].pathMissing = true;
    mocks.resolveWorkspace.mockResolvedValue(workspace);

    const overview = await getProjectOverview("workspace-1");

    expect(overview.repository.folders[1]).toMatchObject({
      folderId: "folder-b",
      status: "missing",
    });
    expect(mocks.readRepositoryProposalFiles).toHaveBeenCalledTimes(1);
  });

  it("discovers archive commits per owner Folder without mutating lineage", async () => {
    mocks.readRepositoryProposalFiles.mockImplementation(
      async ({ folderId, folderName }: { folderId: string; folderName: string }) => [
        proposal(folderId, folderName, "archived"),
      ]
    );
    mocks.buildArchiveCommitIndex.mockImplementation(async (path: string) =>
      path === "/repo-a"
        ? new Map([
            [
              "same-change",
              {
                changeId: "same-change",
                archivedChangeId: "2026-06-01-same-change",
                hash: "hash-a",
                committedAt: "2026-06-01T12:00:00.000Z",
              },
            ],
          ])
        : new Map()
    );

    const overview = await getProjectOverview("workspace-1");

    expect(mocks.buildArchiveCommitIndex).toHaveBeenCalledWith("/repo-a", new Set(["same-change"]));
    expect(overview.recentLineages[0]).toMatchObject({
      proposalStatus: "completed",
      archiveCommitHash: "hash-a",
    });
  });

  it("returns empty Workspace work without fabricating repository relations", async () => {
    mocks.listSubjects.mockResolvedValue([]);
    mocks.readRepositoryProposalFiles.mockResolvedValue([]);

    const overview = await getProjectOverview("workspace-1");

    expect(overview.stats).toMatchObject({ taskLinkedRatio: 0, totalSubjects: 0 });
    expect(overview.activeChanges).toEqual([]);
    expect(overview.recentLineages).toEqual([]);
    expect(mocks.buildArchiveCommitIndex).not.toHaveBeenCalled();
  });
});
