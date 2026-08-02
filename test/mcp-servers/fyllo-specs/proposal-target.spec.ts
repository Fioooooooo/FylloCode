import { describe, expect, it } from "vitest";
import type { McpFolderEntry } from "@shared/types/mcp-workspace";
import {
  ProposalTargetError,
  findProposalTarget,
  resolveProposalTarget,
  validateResolvedProposalTarget,
  type ProposalTargetDependencies,
} from "../../../src/mcp-servers/fyllo-specs/src/runtime-workspace/proposal-target";

const folder: McpFolderEntry = {
  folderId: "folder-1",
  folderName: "App",
  folderPath: "/repos/app",
};

function dependencies(input: {
  worktrees?: string[];
  changes?: string[];
}): ProposalTargetDependencies {
  const changes = new Set(input.changes ?? []);
  return {
    resolveFolder: (folderId) => {
      if (folderId !== folder.folderId) throw new Error("unauthorized");
      return folder;
    },
    listWorktrees: async () => input.worktrees ?? [folder.folderPath],
    validateWorktree: (folderId, worktreePath) => {
      if (
        folderId !== folder.folderId ||
        !(input.worktrees ?? [folder.folderPath]).includes(worktreePath)
      ) {
        throw new Error("not registered");
      }
      return worktreePath;
    },
    changeExists: (worktreePath, changeId) => changes.has(`${worktreePath}:${changeId}`),
  };
}

describe("proposal target resolver", () => {
  const proposalRef = { folderId: folder.folderId, changeId: "add-search" };

  it("returns the main worktree when it is the only match", async () => {
    await expect(
      resolveProposalTarget(
        proposalRef,
        dependencies({ changes: [`${folder.folderPath}:add-search`] })
      )
    ).resolves.toEqual({ proposalRef, worktreeMode: "main", worktreePath: folder.folderPath });
  });

  it("prefers the single linked match over a main match", async () => {
    const linked = "/worktrees/add-search";
    await expect(
      resolveProposalTarget(
        proposalRef,
        dependencies({
          worktrees: [folder.folderPath, linked],
          changes: [`${folder.folderPath}:add-search`, `${linked}:add-search`],
        })
      )
    ).resolves.toMatchObject({ worktreeMode: "linked", worktreePath: linked });
  });

  it("rejects multiple linked matches instead of selecting by enumeration order", async () => {
    const deps = dependencies({
      worktrees: [folder.folderPath, "/worktrees/a", "/worktrees/b"],
      changes: ["/worktrees/a:add-search", "/worktrees/b:add-search"],
    });
    await expect(resolveProposalTarget(proposalRef, deps)).rejects.toMatchObject({
      code: "PROPOSAL_LOCATION_AMBIGUOUS",
    });
  });

  it("returns null when the owner repository has no matching change", async () => {
    await expect(findProposalTarget(proposalRef, dependencies({}))).resolves.toBeNull();
  });

  it("reports invalid non-Git owners", async () => {
    const deps = dependencies({});
    deps.listWorktrees = async () => {
      throw new ProposalTargetError("PROPOSAL_REPOSITORY_INVALID", "not git");
    };
    await expect(findProposalTarget(proposalRef, deps)).rejects.toMatchObject({
      code: "PROPOSAL_REPOSITORY_INVALID",
    });
  });

  it("rejects a stale fixed target without resolving another worktree", () => {
    expect(() =>
      validateResolvedProposalTarget(
        { proposalRef, worktreeMode: "linked", worktreePath: "/worktrees/removed" },
        {
          validateWorktree: () => {
            throw new Error("not registered");
          },
          changeExists: () => true,
        }
      )
    ).toThrowError(expect.objectContaining({ code: "PROPOSAL_TARGET_STALE" }));
  });
});
