import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseMcpWorkspaceDescriptor } from "@shared/types/mcp-workspace";
import { runWithRequestContext } from "../../../src/mcp-servers/shared/request-context";
import { callerFromContext } from "../../../src/mcp-servers/fyllo-spawn/src/tools";

function context(sessionId?: string) {
  return parseMcpWorkspaceDescriptor({
    version: 2,
    workspaceId: "workspace-1",
    workspaceKind: "folder",
    primaryFolderId: "folder-1",
    folders: [
      { folderId: "folder-1", folderName: "Project", folderPath: resolve("/work/project") },
    ],
    workspaceDataDir: resolve("/data/workspace-1"),
    ...(sessionId ? { sessionId } : {}),
  });
}

describe("fyllo-spawn trusted caller", () => {
  it("derives Workspace and parent Session only from request context", () => {
    expect(runWithRequestContext(context("parent-1"), () => callerFromContext())).toEqual({
      workspaceId: "workspace-1",
      parentSessionId: "parent-1",
    });
  });

  it("rejects a trusted context without a parent Session", () => {
    expect(() => runWithRequestContext(context(), () => callerFromContext())).toThrowError(
      expect.objectContaining({ code: "SPAWN_PARENT_SESSION_REQUIRED" })
    );
  });
});
