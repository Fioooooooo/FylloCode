import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { parseMcpWorkspaceDescriptor } from "@shared/types/mcp-workspace";
import { runWithRequestContext } from "../../../src/mcp-servers/shared/request-context";
import { registerTools } from "../../../src/mcp-servers/fyllo-workflow/src/tools";
import {
  listWorkflowsParamsSchema,
  triggerWorkflowParamsSchema,
} from "../../../src/mcp-servers/fyllo-workflow/src/rpc-schema";
import { callerFromContext } from "../../../src/mcp-servers/fyllo-workflow/src/tools/shared";
import type { WorkflowRpcClient } from "../../../src/mcp-servers/fyllo-workflow/src/rpc-client";

interface ToolRegistration {
  name: string;
  config: { description?: string; inputSchema?: unknown };
  handler: (input: Record<string, unknown>, extra: { signal: AbortSignal }) => Promise<unknown>;
}

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

describe("fyllo-workflow tools", () => {
  it("derives caller identity from trusted context and rejects caller-owned tool fields", () => {
    expect(runWithRequestContext(context("parent-1"), () => callerFromContext())).toEqual({
      workspaceId: "workspace-1",
      parentSessionId: "parent-1",
      callerType: "chat",
    });
    expect(listWorkflowsParamsSchema.safeParse({ parentSessionId: "forged" }).success).toBe(false);
    expect(
      triggerWorkflowParamsSchema.safeParse({
        workflowId: "workflow-1",
        parentSessionId: "forged",
        workspacePath: "/other/project",
        yaml: "version: 2",
      }).success
    ).toBe(false);
    expect(() => runWithRequestContext(context(), () => callerFromContext())).toThrowError(
      expect.objectContaining({ code: "WORKFLOW_INVALID_CALLER" })
    );
  });

  it("registers exactly list and trigger tools and sends only their defined params", async () => {
    const registerTool = vi.fn();
    const rpcCall = vi.fn(async ({ method }: { method: string }) =>
      method === "list_workflows"
        ? { workflows: [{ workflowId: "workflow-1", name: "Check" }] }
        : { status: "accepted", runId: "run-1", runStatus: "running" }
    );
    registerTools(
      { registerTool } as unknown as McpServer,
      { call: rpcCall } as unknown as WorkflowRpcClient
    );

    const registrations = registerTool.mock.calls.map(([name, config, handler]) => ({
      name,
      config,
      handler,
    })) as ToolRegistration[];
    expect(registrations.map(({ name }) => name)).toEqual(["list_workflows", "trigger_workflow"]);

    const controller = new AbortController();
    await runWithRequestContext(context("parent-1"), async () => {
      await registrations[0].handler({}, { signal: controller.signal });
      await registrations[1].handler({ workflowId: "workflow-1" }, { signal: controller.signal });
    });

    expect(rpcCall.mock.calls.map(([request]) => request.method)).toEqual([
      "list_workflows",
      "trigger_workflow",
    ]);
    expect(rpcCall.mock.calls[0]?.[0]).toMatchObject({
      params: {},
      caller: { workspaceId: "workspace-1", parentSessionId: "parent-1", callerType: "chat" },
    });
    expect(rpcCall.mock.calls[1]?.[0]).toMatchObject({
      params: { workflowId: "workflow-1" },
      caller: { workspaceId: "workspace-1", parentSessionId: "parent-1", callerType: "chat" },
    });
  });
});
