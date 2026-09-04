import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { parseMcpWorkspaceDescriptor } from "@shared/types/mcp-workspace";
import { runWithRequestContext } from "../../../src/mcp-servers/shared/request-context";
import { WorkflowRpcClient } from "../../../src/mcp-servers/fyllo-workflow/src/rpc-client";
import { proposeWorkflowParamsSchema } from "../../../src/mcp-servers/fyllo-workflow/src/rpc-schema";
import { registerProposeWorkflowTool } from "../../../src/mcp-servers/fyllo-workflow/src/tools/propose-workflow";

interface ToolRegistration {
  handler: (input: Record<string, unknown>, extra: { signal: AbortSignal }) => Promise<unknown>;
}

interface DescribedSchemaField {
  description?: string;
}

interface DescribedSchemaObject {
  shape?: Record<string, DescribedSchemaField>;
}

interface ProposalToolConfig {
  description?: string;
  inputSchema?: {
    options?: DescribedSchemaObject[];
  };
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

function registration(registerTool: ReturnType<typeof vi.fn>): ToolRegistration {
  const call = registerTool.mock.calls[0];
  expect(call?.[0]).toBe("propose_workflow");
  return { handler: call?.[2] as ToolRegistration["handler"] };
}

describe("propose_workflow MCP tool", () => {
  it("documents the mode, workflowId, and persist relationships", () => {
    const registerTool = vi.fn();
    registerProposeWorkflowTool(
      { registerTool } as unknown as McpServer,
      { call: vi.fn() } as unknown as WorkflowRpcClient
    );

    const config = registerTool.mock.calls[0]?.[1] as ProposalToolConfig;
    const [createSchema, updateSchema] = config.inputSchema?.options ?? [];
    const createShape = createSchema?.shape ?? {};
    const updateShape = updateSchema?.shape ?? {};

    expect(config.description).toContain("mode=create");
    expect(config.description).toContain("MUST omit workflowId");
    expect(config.description).toContain("mode=update");
    expect(config.description).toContain("MUST include workflowId");
    expect(config.description).toContain("user's confirmation choice is final");
    expect(createShape.mode?.description).toContain("workflowId must be omitted");
    expect(createShape.workflowId?.description).toContain("Must be omitted");
    expect(updateShape.mode?.description).toContain("workflowId is required");
    expect(updateShape.workflowId?.description).toContain("Required when mode is update");
    expect(updateShape.workflowId?.description).toContain("omit this field for mode=create");
    expect(createShape.persist?.description).toContain("session shadow");
    expect(createShape.persist?.description).toContain("user's confirmation choice is final");
  });

  it("forwards create and update params with trusted caller identity", async () => {
    const registerTool = vi.fn();
    const rpcCall = vi
      .fn()
      .mockResolvedValueOnce({ status: "accepted", proposalId: "proposal-create" })
      .mockResolvedValueOnce({ status: "accepted", proposalId: "proposal-update" });
    registerProposeWorkflowTool(
      { registerTool } as unknown as McpServer,
      { call: rpcCall } as unknown as WorkflowRpcClient
    );
    const tool = registration(registerTool);
    const controller = new AbortController();
    const create = { mode: "create", yaml: "version: 2\nname: Check", persist: "session" };
    const update = {
      mode: "update",
      workflowId: "workflow-1",
      yaml: "version: 2\nname: Check v2",
      persist: "workspace",
    };

    await runWithRequestContext(context("parent-1"), () =>
      tool.handler(create, { signal: controller.signal })
    );
    await runWithRequestContext(context("parent-1"), () =>
      tool.handler(update, { signal: controller.signal })
    );

    expect(rpcCall.mock.calls.map(([request]) => request)).toEqual([
      expect.objectContaining({
        method: "propose_workflow",
        params: create,
        caller: { workspaceId: "workspace-1", parentSessionId: "parent-1", callerType: "chat" },
      }),
      expect.objectContaining({
        method: "propose_workflow",
        params: update,
        caller: { workspaceId: "workspace-1", parentSessionId: "parent-1", callerType: "chat" },
      }),
    ]);
  });

  it("keeps proposal input strict and rejects a non-chat caller", async () => {
    expect(
      proposeWorkflowParamsSchema.safeParse({
        mode: "create",
        yaml: "version: 2",
        persist: "session",
        workspaceId: "forged",
      }).success
    ).toBe(false);
    expect(
      proposeWorkflowParamsSchema.safeParse({
        mode: "update",
        yaml: "version: 2",
        persist: "workspace",
      }).success
    ).toBe(false);

    const registerTool = vi.fn();
    const rpcCall = vi.fn();
    registerProposeWorkflowTool(
      { registerTool } as unknown as McpServer,
      { call: rpcCall } as unknown as WorkflowRpcClient
    );
    const tool = registration(registerTool);
    const result = await runWithRequestContext(context(), () =>
      tool.handler(
        { mode: "create", yaml: "version: 2", persist: "session" },
        { signal: new AbortController().signal }
      )
    );

    expect(result).toMatchObject({
      isError: true,
      structuredContent: { error: { code: "WORKFLOW_INVALID_CALLER" } },
    });
    expect(rpcCall).not.toHaveBeenCalled();
  });
});
