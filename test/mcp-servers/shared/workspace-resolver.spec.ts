import { afterEach, describe, expect, it } from "vitest";
import { parseMcpWorkspaceDescriptor } from "@shared/types/mcp-workspace";
import { runWithRequestContext } from "../../../src/mcp-servers/shared/request-context";
import { resetStdioWorkspaceContextForTests } from "../../../src/mcp-servers/shared/workspace-context";
import {
  resolveFolder,
  resolvePrimaryFolder,
  resolveSingleFolder,
  resolveWorkspace,
  validateWorktree,
} from "../../../src/mcp-servers/shared/workspace-resolver";

function descriptor(folderCount = 2) {
  return parseMcpWorkspaceDescriptor({
    version: 2,
    workspaceId: "workspace-1",
    workspaceKind: folderCount === 1 ? "folder" : "collection",
    primaryFolderId: "folder-a",
    folders: [
      { folderId: "folder-a", folderName: "A", folderPath: "/tmp/a" },
      ...(folderCount === 1
        ? []
        : [{ folderId: "folder-b", folderName: "B", folderPath: "/tmp/b" }]),
    ],
    workspaceDataDir: "/tmp/workspace-data",
    mcpEventDir: "/tmp/mcp-events",
    sessionId: "session-1",
  });
}

afterEach(() => {
  delete process.env.FYLLO_WORKSPACE_JSON;
  resetStdioWorkspaceContextForTests();
});

describe("workspace resolver", () => {
  it("reads the request-local HTTP descriptor and resolves only snapshot folders", () => {
    const workspace = descriptor();

    runWithRequestContext(workspace, () => {
      expect(resolveWorkspace()).toBe(workspace);
      expect(resolvePrimaryFolder()).toBe(workspace.folders[0]);
      expect(resolveFolder("folder-b")).toBe(workspace.folders[1]);
      expect(() => resolveFolder("folder-outside")).toThrowError(
        expect.objectContaining({ code: "MCP_WORKSPACE_FOLDER_UNAUTHORIZED" })
      );
    });
  });

  it("strictly parses and freezes one stdio descriptor snapshot", () => {
    process.env.FYLLO_WORKSPACE_JSON = JSON.stringify(descriptor(1));

    const first = resolveWorkspace();
    process.env.FYLLO_WORKSPACE_JSON = JSON.stringify({ ...descriptor(1), workspaceId: "changed" });
    const second = resolveWorkspace();

    expect(second).toBe(first);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.folders)).toBe(true);
    expect(Object.isFrozen(first.folders[0])).toBe(true);
    expect(first.workspaceId).toBe("workspace-1");
  });

  it("does not fall back to cwd when stdio context is missing or invalid", () => {
    expect(() => resolveWorkspace()).toThrow("FYLLO_WORKSPACE_JSON is required");

    process.env.FYLLO_WORKSPACE_JSON = "not-json";
    expect(() => resolveWorkspace()).toThrow("descriptor must be valid JSON");
  });

  it("requires an explicit owner for multi-root repository operations", () => {
    runWithRequestContext(descriptor(), () => {
      expect(() => resolveSingleFolder()).toThrowError(
        expect.objectContaining({ code: "MCP_WORKSPACE_OWNER_REQUIRED" })
      );
      expect(resolveSingleFolder("folder-b").folderPath).toBe("/tmp/b");
    });
  });

  it("allows owner omission only for a single-folder descriptor", () => {
    runWithRequestContext(descriptor(1), () => {
      expect(resolveSingleFolder()).toEqual(
        expect.objectContaining({ folderId: "folder-a", folderPath: "/tmp/a" })
      );
    });
  });

  it("accepts the canonical Folder root and its registered worktree", () => {
    const dependencies = {
      realpath: (path: string) => path,
      listRegisteredWorktrees: () => ["/worktrees/feature"],
    };

    runWithRequestContext(descriptor(), () => {
      expect(validateWorktree("folder-a", "/tmp/a", dependencies)).toBe("/tmp/a");
      expect(validateWorktree("folder-a", "/worktrees/feature", dependencies)).toBe(
        "/worktrees/feature"
      );
    });
  });

  it.each([
    ["other repository", "/other/repository"],
    ["unregistered path", "/worktrees/unregistered"],
    ["path prefix forgery", "/tmp/a-copy"],
  ])("rejects %s", (_label, targetPath) => {
    const dependencies = {
      realpath: (path: string) => path,
      listRegisteredWorktrees: () => ["/worktrees/feature"],
    };

    runWithRequestContext(descriptor(), () => {
      expect(() => validateWorktree("folder-a", targetPath, dependencies)).toThrowError(
        expect.objectContaining({ code: "MCP_WORKTREE_NOT_REGISTERED" })
      );
    });
  });

  it("rejects relative paths before repository lookup", () => {
    const dependencies = {
      realpath: (path: string) => path,
      listRegisteredWorktrees: () => ["/worktrees/feature"],
    };

    runWithRequestContext(descriptor(), () => {
      expect(() => validateWorktree("folder-a", "../feature", dependencies)).toThrowError(
        expect.objectContaining({ code: "MCP_WORKTREE_PATH_INVALID" })
      );
    });
  });

  it("rejects a symlink that resolves outside the registered repository worktrees", () => {
    const dependencies = {
      realpath: (path: string) => (path === "/tmp/a/link" ? "/outside/escaped" : path),
      listRegisteredWorktrees: () => ["/worktrees/feature"],
    };

    runWithRequestContext(descriptor(), () => {
      expect(() => validateWorktree("folder-a", "/tmp/a/link", dependencies)).toThrowError(
        expect.objectContaining({ code: "MCP_WORKTREE_NOT_REGISTERED" })
      );
    });
  });
});
