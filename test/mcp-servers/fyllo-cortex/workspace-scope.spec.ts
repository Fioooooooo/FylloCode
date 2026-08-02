import { describe, expect, it } from "vitest";
import { parseMcpWorkspaceDescriptor } from "@shared/types/mcp-workspace";
import { getWorkspaceDataDir } from "../../../src/mcp-servers/shared/env";
import { runWithRequestContext } from "../../../src/mcp-servers/shared/request-context";
import { resolveProjectRoot } from "../../../src/mcp-servers/fyllo-cortex/src/utils/project-root";

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

describe("fyllo-cortex Workspace scope", () => {
  it("reads Workspace-owned data and the unique repository owner", () => {
    runWithRequestContext(descriptor(["/tmp/repo-a"]), () => {
      expect(getWorkspaceDataDir()).toBe("/tmp/workspace-data");
      expect(resolveProjectRoot()).toBe("/tmp/repo-a");
    });
  });

  it("rejects repository ownership ambiguity without hiding Workspace data", () => {
    runWithRequestContext(descriptor(["/tmp/repo-a", "/tmp/repo-b"]), () => {
      expect(getWorkspaceDataDir()).toBe("/tmp/workspace-data");
      expect(() => resolveProjectRoot()).toThrowError(
        expect.objectContaining({ code: "MCP_WORKSPACE_OWNER_REQUIRED" })
      );
    });
  });
});
