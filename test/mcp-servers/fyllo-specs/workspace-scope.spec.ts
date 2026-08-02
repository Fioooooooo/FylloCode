import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import spawn from "cross-spawn";
import { afterEach, describe, expect, it } from "vitest";
import { parseMcpWorkspaceDescriptor } from "@shared/types/mcp-workspace";
import { runWithRequestContext } from "../../../src/mcp-servers/shared/request-context";
import {
  resolveProjectRoot,
  validateTargetPath,
} from "../../../src/mcp-servers/fyllo-specs/src/utils/project-root";
import { createPlanTool } from "../../../src/mcp-servers/fyllo-specs/src/tools/create-plan";

const temporaryDirectories: string[] = [];

function createRepository(): string {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), "fyllo-specs-scope-")));
  temporaryDirectories.push(root);
  const result = spawn.sync("git", ["init"], { cwd: root, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout);
  }
  return root;
}

function descriptor(folderPaths: string[]) {
  return parseMcpWorkspaceDescriptor({
    version: 2,
    workspaceId: "workspace-1",
    workspaceKind: folderPaths.length === 1 ? "folder" : "collection",
    primaryFolderId: "folder-1",
    folders: folderPaths.map((folderPath, index) => ({
      folderId: `folder-${index + 1}`,
      folderName: `Folder ${index + 1}`,
      folderPath,
    })),
    workspaceDataDir: "/tmp/workspace-data",
  });
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("fyllo-specs Workspace scope", () => {
  it("uses the unique descriptor Folder and validates its main worktree", () => {
    const root = createRepository();

    runWithRequestContext(descriptor([root]), () => {
      expect(resolveProjectRoot()).toBe(root);
      expect(validateTargetPath(root)).toEqual({ ok: true, resolved: root });
    });
  });

  it("returns an owner-required error instead of selecting primary in multi-root", () => {
    runWithRequestContext(descriptor(["/tmp/repo-a", "/tmp/repo-b"]), () => {
      expect(validateTargetPath("/tmp/repo-a")).toEqual(
        expect.objectContaining({
          ok: false,
          error: expect.stringContaining("folderId is required"),
        })
      );
    });
  });

  it("rejects a plan before writing when event ownership is ambiguous", async () => {
    await runWithRequestContext(descriptor(["/tmp/repo-a", "/tmp/repo-b"]), async () => {
      const text = await createPlanTool({ goal: "Plan safely", slug: "safe-plan" });
      expect(text).toContain('"type": "WorkspaceResolverError"');
      expect(text).toContain("folderId is required");
    });
  });
});
