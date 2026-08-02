import { existsSync, mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "fs";
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

import { applyChangeTool } from "../../../src/mcp-servers/fyllo-specs/src/tools/apply-change";
import { archiveChangeTool } from "../../../src/mcp-servers/fyllo-specs/src/tools/archive-change";

function git(cwd: string, args: string[]): void {
  const result = spawn.sync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
}

function createChange(changeId: string): string {
  const changePath = join(folderPath, "openspec", "changes", changeId);
  mkdirSync(join(changePath, "specs", "sample"), { recursive: true });
  writeFileSync(join(changePath, ".openspec.yaml"), "schema: spec-driven\nstatus: applying\n");
  writeFileSync(join(changePath, "proposal.md"), "## Why\n\nFixture.\n");
  writeFileSync(join(changePath, "design.md"), "## Context\n\nFixture.\n");
  writeFileSync(join(changePath, "tasks.md"), "- [x] 1.1 done\n");
  writeFileSync(
    join(changePath, "specs", "sample", "spec.md"),
    "## ADDED Requirements\n\n### Requirement: Sample\nThe system SHALL work.\n\n#### Scenario: Works\n- **WHEN** used\n- **THEN** it works\n"
  );
  return changePath;
}

describe("apply/archive repository owner", () => {
  beforeEach(() => {
    folderPath = mkdtempSync(join(tmpdir(), "fyllo-lifecycle-owner-"));
    mkdirSync(join(folderPath, "openspec", "changes"), { recursive: true });
    writeFileSync(join(folderPath, "openspec", "config.yaml"), "schema: spec-driven\n");
    git(folderPath, ["init"]);
    git(folderPath, ["config", "user.name", "Fyllo Test"]);
    git(folderPath, ["config", "user.email", "test@example.com"]);
    writeFileSync(join(folderPath, "README.md"), "fixture\n");
    git(folderPath, ["add", "-A"]);
    git(folderPath, ["commit", "-m", "chore(test): initial"]);
  });

  it("returns a trusted target for apply without caller paths", async () => {
    createChange("apply-owned");
    const state = JSON.parse(
      await applyChangeTool({
        folderId: "folder-1",
        changeName: "apply-owned",
        includeInstruction: false,
      })
    );
    expect(state.target).toEqual({
      proposalRef: { folderId: "folder-1", changeId: "apply-owned" },
      worktreeMode: "main",
      worktreePath: realpathSync.native(folderPath),
    });
    expect(state).not.toHaveProperty("projectRoot");
  });

  it("previews archive against the resolved owner target", async () => {
    const changePath = createChange("archive-owned");
    const state = JSON.parse(
      await archiveChangeTool({
        folderId: "folder-1",
        changeName: "archive-owned",
        includeInstruction: false,
      })
    );
    expect(state.target).toMatchObject({
      proposalRef: { folderId: "folder-1", changeId: "archive-owned" },
      worktreeMode: "main",
    });
    expect(state.finalization.gitOps).toEqual([]);
    expect(state).not.toHaveProperty("workspace");
    expect(existsSync(changePath)).toBe(true);
  });
});
