import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import spawn from "cross-spawn";
import { beforeEach, describe, expect, it, vi } from "vitest";

let folderPath = "";

vi.mock("../../../src/mcp-servers/shared/workspace-context", () => ({
  getWorkspaceContext: () => ({
    version: 2,
    workspaceId: "workspace-1",
    workspaceKind: "folder",
    primaryFolderId: "folder-1",
    folders: [{ folderId: "folder-1", folderName: "App", folderPath }],
    workspaceDataDir: "/tmp/fyllo-data",
  }),
}));

import { createProposalTool } from "../../../src/mcp-servers/fyllo-specs/src/tools/create-proposal";

function git(cwd: string, args: string[]): void {
  const result = spawn.sync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
}

interface CreateProposalState {
  target: {
    proposalRef: { folderId: string; changeId: string };
    worktreeMode: string;
    worktreePath: string;
  };
  error: { code: string };
}

function parseState(text: string): CreateProposalState {
  return JSON.parse(text) as CreateProposalState;
}

describe("create-proposal repository owner", () => {
  beforeEach(() => {
    folderPath = mkdtempSync(join(tmpdir(), "fyllo-create-owner-"));
    mkdirSync(join(folderPath, "openspec", "changes"), { recursive: true });
    writeFileSync(join(folderPath, "openspec", "config.yaml"), "schema: spec-driven\n");
    git(folderPath, ["init"]);
    git(folderPath, ["config", "user.name", "Fyllo Test"]);
    git(folderPath, ["config", "user.email", "test@example.com"]);
    writeFileSync(join(folderPath, "README.md"), "fixture\n");
    git(folderPath, ["add", "-A"]);
    git(folderPath, ["commit", "-m", "chore(test): initial"]);
  });

  it("creates a main-worktree proposal for the selected Folder", async () => {
    const state = parseState(
      await createProposalTool({
        folderId: "folder-1",
        changeName: "add-search",
        worktreeMode: "main",
        includeInstruction: false,
      })
    );
    expect(state.target).toEqual({
      proposalRef: { folderId: "folder-1", changeId: "add-search" },
      worktreeMode: "main",
      worktreePath: folderPath,
    });
    expect(existsSync(join(folderPath, "openspec", "changes", "add-search"))).toBe(true);
  });

  it("returns the existing target without overwriting the change", async () => {
    await createProposalTool({
      folderId: "folder-1",
      changeName: "existing-change",
      worktreeMode: "main",
      includeInstruction: false,
    });
    const marker = join(folderPath, "openspec", "changes", "existing-change", "marker.txt");
    writeFileSync(marker, "keep\n");

    const state = parseState(
      await createProposalTool({
        folderId: "folder-1",
        changeName: "existing-change",
        worktreeMode: "linked",
        includeInstruction: false,
      })
    );
    expect(state.error.code).toBe("PROPOSAL_ALREADY_EXISTS");
    expect(state.target.proposalRef).toEqual({
      folderId: "folder-1",
      changeId: "existing-change",
    });
    expect(existsSync(marker)).toBe(true);
    expect(existsSync(join(folderPath, ".worktrees", "existing-change"))).toBe(false);
  });
});
