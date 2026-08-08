import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { parseMcpWorkspaceDescriptor } from "@shared/types/mcp-workspace";
import { runWithRequestContext } from "../../../src/mcp-servers/shared/request-context";
import { callerFromContext, registerTools } from "../../../src/mcp-servers/fyllo-spawn/src/tools";
import type { SpawnRpcClient } from "../../../src/mcp-servers/fyllo-spawn/src/rpc-client";

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

  it("documents background ownership without exposing a response path", () => {
    const registerTool = vi.fn();
    registerTools(
      { registerTool } as unknown as McpServer,
      { call: vi.fn() } as unknown as SpawnRpcClient
    );
    const promptRegistration = registerTool.mock.calls.find(([name]) => name === "prompt_to_agent");
    const description = promptRegistration?.[1]?.description as string;

    expect(description).toContain("background=true");
    expect(description).toContain("check_session_status");
    expect(description).toContain("responseId + read_response");
    expect(description).toContain("no absolute runtime limit");
    expect(description).toContain("injected spawn.session Signal contract");
    expect(description).toContain("synchronous or background creation");
    expect(description).toContain("do not repeat it for continuation calls");
    expect(description).not.toContain("responsePath");
    expect(description).not.toContain("app-data");
    expect(description).not.toContain('{"sessionId"');
  });
});
