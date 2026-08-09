import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import spawn from "cross-spawn";
import { beforeEach, describe, expect, it, vi } from "vitest";

let folderPath = "";

const mocks = vi.hoisted(() => ({
  archiveChange: vi.fn(),
}));

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

vi.mock("../../../src/mcp-servers/fyllo-specs/src/runtime-openspec", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../../../src/mcp-servers/fyllo-specs/src/runtime-openspec")
  >()),
  archiveChange: mocks.archiveChange,
}));

import { OpenspecArchiveMetadataUpdateError } from "../../../src/mcp-servers/fyllo-specs/src/runtime-openspec";
import { archiveChangeTool } from "../../../src/mcp-servers/fyllo-specs/src/tools/archive-change";

describe("archive metadata failure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    folderPath = realpathSync.native(
      mkdtempSync(join(tmpdir(), "fyllo-archive-metadata-failure-"))
    );
    spawn.sync("git", ["init"], { cwd: folderPath, encoding: "utf8" });
    const changeDir = join(folderPath, "openspec", "changes", "metadata-failure");
    mkdirSync(changeDir, { recursive: true });
    writeFileSync(join(changeDir, ".openspec.yaml"), "schema: spec-driven\nstatus: applying\n");
    writeFileSync(join(changeDir, "tasks.md"), "- [x] done\n");
  });

  it("reports partial success and skips git finalization without rerunning archive", async () => {
    const archiveTarget = join(
      folderPath,
      "openspec",
      "changes",
      "archive",
      "2026-08-09-metadata-failure"
    );
    mocks.archiveChange.mockRejectedValue(
      new OpenspecArchiveMetadataUpdateError(
        {
          changeName: "metadata-failure",
          archiveTarget,
          conflicts: [],
          deltaSpecSummary: null,
          archiveRawOutput: "Change 'metadata-failure' archived as '2026-08-09-metadata-failure'.",
        },
        "EACCES"
      )
    );

    const state = JSON.parse(
      await archiveChangeTool({
        folderId: "folder-1",
        changeName: "metadata-failure",
        confirm: true,
        commitMessage: "feat(proposal): persist archived metadata",
        includeInstruction: false,
      })
    );

    expect(state.status).toBe("failed");
    expect(state.archive).toMatchObject({
      ok: true,
      archiveTarget,
      error: { code: "archive-metadata-update-failed" },
    });
    expect(state.finalization).toMatchObject({
      ok: false,
      gitOps: [],
      failedStep: null,
      recovery: {
        required: "agent",
        kind: "archive-metadata-update",
      },
    });
    expect(state.finalization.recovery.instructions.join("\n")).toContain(
      "do not rerun archive-change"
    );
    expect(state.finalization.recovery.remainingSteps).toContain("repair-archive-metadata");
  });
});
