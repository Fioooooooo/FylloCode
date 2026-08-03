import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import spawn from "cross-spawn";
import { beforeEach, describe, expect, it, vi } from "vitest";

let folders: Array<{ folderId: string; folderName: string; folderPath: string }> = [];

vi.mock("../../../src/mcp-servers/shared/workspace-context", () => ({
  getWorkspaceContext: () => ({
    version: 2,
    workspaceId: "workspace-1",
    workspaceKind: "collection",
    primaryFolderId: folders[0]!.folderId,
    folders,
    workspaceDataDir: "/tmp/fyllo-data",
  }),
}));

import { createProposalTool } from "../../../src/mcp-servers/fyllo-specs/src/tools/create-proposal";
import { exploreTool } from "../../../src/mcp-servers/fyllo-specs/src/tools/explore";

function git(cwd: string, args: string[]): void {
  const result = spawn.sync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
}

function createRepo(name: string, initializeOpenspec = true): string {
  const root = mkdtempSync(join(tmpdir(), `fyllo-explore-${name}-`));
  if (initializeOpenspec) {
    mkdirSync(join(root, "openspec", "changes"), { recursive: true });
    writeFileSync(join(root, "openspec", "config.yaml"), "schema: spec-driven\n");
  }
  git(root, ["init"]);
  git(root, ["config", "user.name", "Fyllo Test"]);
  git(root, ["config", "user.email", "test@example.com"]);
  writeFileSync(join(root, "README.md"), `${name}\n`);
  git(root, ["add", "-A"]);
  git(root, ["commit", "-m", "chore(test): initial"]);
  return root;
}

interface ExploreState {
  activeChanges: Array<{
    folderId: string;
    changeId: string;
    worktreeMode: string;
    worktreePath: string;
  }>;
  currentChange: {
    proposalRef: { folderId: string; changeId: string };
    worktreeMode: string;
    worktreePath: string;
  } | null;
  warnings: Array<{ folderId: string; code: string; message: string }>;
  errors: Array<{
    code: string;
    details: {
      candidates: unknown[];
      warnings: Array<{ folderId: string; code: string }>;
    };
  }>;
}

function parseState(text: string): ExploreState {
  return JSON.parse(text) as ExploreState;
}

describe("explore repository owners", () => {
  beforeEach(() => {
    folders = [
      { folderId: "folder-a", folderName: "A", folderPath: createRepo("a") },
      { folderId: "folder-b", folderName: "B", folderPath: createRepo("b") },
    ];
  });

  it("keeps same-name changes from different Folders", async () => {
    for (const folder of folders) {
      await createProposalTool({
        folderId: folder.folderId,
        changeName: "same-change",
        worktreeMode: "main",
        includeInstruction: false,
      });
    }

    const state = parseState(await exploreTool({ includeInstruction: false }));
    expect(state.activeChanges).toHaveLength(2);
    expect(state.activeChanges.map((change) => change.folderId).sort()).toEqual([
      "folder-a",
      "folder-b",
    ]);
    expect(state.activeChanges.every((change) => change.changeId === "same-change")).toBe(true);
  });

  it("scans only an explicit Folder owner", async () => {
    await createProposalTool({
      folderId: "folder-b",
      changeName: "owned-change",
      worktreeMode: "main",
      includeInstruction: false,
    });
    const state = parseState(
      await exploreTool({ folderId: "folder-b", includeInstruction: false })
    );
    expect(state.activeChanges).toHaveLength(1);
    expect(state.activeChanges[0]).toMatchObject({
      folderId: "folder-b",
      changeId: "owned-change",
      worktreeMode: "main",
    });
  });

  it("keeps a linked proposal when the owner main worktree has no OpenSpec changes", async () => {
    const folderPath = createRepo("linked-only", false);
    folders = [{ folderId: "folder-a", folderName: "A", folderPath }];
    const created = JSON.parse(
      await createProposalTool({
        folderId: "folder-a",
        changeName: "linked-change",
        worktreeMode: "linked",
        includeInstruction: false,
      })
    ) as { target: { worktreePath: string } };

    const state = parseState(
      await exploreTool({
        folderId: "folder-a",
        changeName: "linked-change",
        includeInstruction: false,
      })
    );
    const worktreePath = realpathSync.native(created.target.worktreePath);

    expect(state.activeChanges).toEqual([
      expect.objectContaining({
        folderId: "folder-a",
        changeId: "linked-change",
        worktreeMode: "linked",
        worktreePath,
      }),
    ]);
    expect(state.currentChange).toMatchObject({
      proposalRef: { folderId: "folder-a", changeId: "linked-change" },
      worktreeMode: "linked",
      worktreePath,
    });
    expect(state.warnings).toEqual([
      expect.objectContaining({
        folderId: "folder-a",
        code: "PROPOSAL_FOLDER_SCAN_FAILED",
      }),
    ]);
  });

  it("rejects an ownerless currentChange with multiple matches", async () => {
    for (const folder of folders) {
      await createProposalTool({
        folderId: folder.folderId,
        changeName: "same-change",
        worktreeMode: "main",
        includeInstruction: false,
      });
    }
    const state = parseState(
      await exploreTool({ changeName: "same-change", includeInstruction: false })
    );
    expect(state.errors[0]).toMatchObject({ code: "PROPOSAL_OWNER_AMBIGUOUS" });
    expect(state.errors[0].details.candidates).toHaveLength(2);
  });

  it("rejects owner inference when any Folder scan fails", async () => {
    await createProposalTool({
      folderId: "folder-a",
      changeName: "visible-change",
      worktreeMode: "main",
      includeInstruction: false,
    });
    folders[1] = {
      ...folders[1]!,
      folderPath: mkdtempSync(join(tmpdir(), "fyllo-explore-not-git-")),
    };
    const state = parseState(
      await exploreTool({ changeName: "visible-change", includeInstruction: false })
    );
    expect(state.errors[0]).toMatchObject({ code: "PROPOSAL_OWNER_UNVERIFIED" });
    expect(state.errors[0].details.warnings[0]).toMatchObject({
      folderId: "folder-b",
      code: "PROPOSAL_FOLDER_SCAN_FAILED",
    });
  });
});
