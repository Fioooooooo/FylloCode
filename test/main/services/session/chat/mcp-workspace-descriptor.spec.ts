import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  createOwnerMcpWorkspaceDescriptor,
  createSessionMcpWorkspaceDescriptor,
  type McpWorkspaceDescriptorDependencies,
} from "@main/services/session/chat/mcp-workspace-descriptor";
import type { SessionWorkspaceSnapshot } from "@shared/types/workspace";

const rootA = resolve("/workspace/a");
const rootB = resolve("/workspace/b");
const dataDir = resolve("/app-data/workspaces/workspace-1");
const eventDir = resolve(dataDir, "mcp-events");

function snapshot(): SessionWorkspaceSnapshot {
  return {
    workspaceId: "workspace-1",
    workspaceKind: "collection",
    primaryFolderId: "folder-a",
    folders: [
      { folderId: "folder-a", folderName: "A", folderPath: rootA },
      { folderId: "folder-b", folderName: "B", folderPath: rootB },
    ],
    cwd: rootA,
    additionalDirectories: [rootB],
  };
}

function dependencies(): McpWorkspaceDescriptorDependencies {
  return {
    assertSnapshotCurrent: vi.fn(async (value) => value),
    resolveWorkspaceDataDir: vi.fn(() => dataDir),
    resolveMcpEventsDir: vi.fn(() => eventDir),
  };
}

describe("MCP Workspace descriptor projection", () => {
  it("projects an ordered Session authorization snapshot after stale validation", async () => {
    const deps = dependencies();
    const input = snapshot();
    const descriptor = await createSessionMcpWorkspaceDescriptor(input, "session-1", deps);

    expect(deps.assertSnapshotCurrent).toHaveBeenCalledWith(input);
    expect(descriptor).toEqual({
      version: 2,
      workspaceId: "workspace-1",
      workspaceKind: "collection",
      primaryFolderId: "folder-a",
      folders: input.folders,
      workspaceDataDir: dataDir,
      mcpEventDir: eventDir,
      sessionId: "session-1",
    });
  });

  it("does not resolve storage or emit a partial descriptor when stale validation fails", async () => {
    const deps = dependencies();
    vi.mocked(deps.assertSnapshotCurrent).mockRejectedValueOnce(
      new Error("SESSION_FOLDER_REMOVED")
    );

    await expect(
      createSessionMcpWorkspaceDescriptor(snapshot(), "session-1", deps)
    ).rejects.toThrow("SESSION_FOLDER_REMOVED");
    expect(deps.resolveWorkspaceDataDir).not.toHaveBeenCalled();
    expect(deps.resolveMcpEventsDir).not.toHaveBeenCalled();
  });

  it("projects apply/archive scope to exactly one owner Folder", () => {
    const deps = dependencies();
    const descriptor = createOwnerMcpWorkspaceDescriptor(
      {
        workspaceId: "workspace-1",
        workspaceKind: "collection",
        ownerFolder: { folderId: "folder-b", folderName: "B", folderPath: rootB },
        sessionId: "apply-session-1",
      },
      deps
    );

    expect(descriptor.primaryFolderId).toBe("folder-b");
    expect(descriptor.folders).toEqual([
      { folderId: "folder-b", folderName: "B", folderPath: rootB },
    ]);
    expect(descriptor.workspaceDataDir).toBe(dataDir);
    expect(descriptor.mcpEventDir).toBe(eventDir);
  });

  it("rejects a non-canonical owner Folder before activation", () => {
    const deps = dependencies();
    expect(() =>
      createOwnerMcpWorkspaceDescriptor(
        {
          workspaceId: "workspace-1",
          workspaceKind: "collection",
          ownerFolder: {
            folderId: "folder-b",
            folderName: "B",
            folderPath: `${rootB}/../b`,
          },
        },
        deps
      )
    ).toThrow(/canonical absolute path/);
  });
});
