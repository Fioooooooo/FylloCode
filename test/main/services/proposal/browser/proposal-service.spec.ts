import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveWorkspace: vi.fn(),
  listRegisteredWorktreePaths: vi.fn(),
  readRepositoryProposalFiles: vi.fn(),
  readChangeFileInTarget: vi.fn(),
  readProposalSpecDeltas: vi.fn(),
}));

vi.mock("@main/services/workspace/_public", () => ({ resolveWorkspace: mocks.resolveWorkspace }));
vi.mock("@main/infra/git/worktree-reader", () => ({
  listRegisteredWorktreePaths: mocks.listRegisteredWorktreePaths,
}));
vi.mock("@main/infra/proposal/openspec-reader", () => ({
  readRepositoryProposalFiles: mocks.readRepositoryProposalFiles,
  readChangeFileInTarget: mocks.readChangeFileInTarget,
}));
vi.mock("@main/services/proposal/browser/proposal-spec-delta-service", () => ({
  getProposalSpecDeltas: mocks.readProposalSpecDeltas,
}));

import {
  getProposalSpecDeltas,
  listProposals,
  readProposalFile,
} from "@main/services/proposal/browser/proposal-service";

function proposal(folderId: string, folderName: string, worktreePath: string) {
  return {
    id: "same-change",
    proposalRef: { folderId, changeId: "same-change" },
    folderName,
    title: "Same Change",
    status: "draft" as const,
    why: "",
    totalTasks: 1,
    doneTasks: 0,
    hasDesign: true,
    date: "2026-08-02T00:00:00.000Z",
    worktreeMode: "main" as const,
    worktreePath,
  };
}

describe("proposal service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveWorkspace.mockResolvedValue({
      availableFolders: [
        { folderId: "folder-a", folderName: "A", folderPath: "/repo-a" },
        { folderId: "folder-b", folderName: "B", folderPath: "/repo-b" },
      ],
    });
    mocks.listRegisteredWorktreePaths.mockResolvedValue({ paths: [] });
    mocks.readRepositoryProposalFiles.mockImplementation(
      async ({ folderId, folderName, folderPath }) => [proposal(folderId, folderName, folderPath)]
    );
  });

  it("keeps same-name proposals from different Folder repositories", async () => {
    const result = await listProposals("workspace-1");
    expect(result).toHaveLength(2);
    expect(result.map((item) => item.proposalRef.folderId).sort()).toEqual([
      "folder-a",
      "folder-b",
    ]);
  });

  it("reads detail and delta files from the ProposalRef owner target", async () => {
    mocks.readChangeFileInTarget.mockResolvedValue("content");
    mocks.readProposalSpecDeltas.mockResolvedValue({ items: [] });
    const proposalRef = { folderId: "folder-b", changeId: "same-change" };

    await expect(readProposalFile("workspace-1", proposalRef, "proposal.md")).resolves.toBe(
      "content"
    );
    await getProposalSpecDeltas("workspace-1", proposalRef);

    expect(mocks.readChangeFileInTarget).toHaveBeenCalledWith(
      "/repo-b",
      "same-change",
      "proposal.md"
    );
    expect(mocks.readProposalSpecDeltas).toHaveBeenCalledWith("/repo-b", "same-change");
  });
});
