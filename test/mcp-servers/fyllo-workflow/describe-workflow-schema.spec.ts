import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { parseMcpWorkspaceDescriptor } from "@shared/types/mcp-workspace";
import { runWithRequestContext } from "../../../src/mcp-servers/shared/request-context";
import { WorkflowRpcClient } from "../../../src/mcp-servers/fyllo-workflow/src/rpc-client";
import { registerDescribeWorkflowSchemaTool } from "../../../src/mcp-servers/fyllo-workflow/src/tools/describe-workflow-schema";

interface ToolRegistration {
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

function registration(registerTool: ReturnType<typeof vi.fn>): ToolRegistration {
  const call = registerTool.mock.calls[0];
  expect(call?.[0]).toBe("describe_workflow_schema");
  return { handler: call?.[2] as ToolRegistration["handler"] };
}

describe("describe_workflow_schema MCP tool", () => {
  it("forwards the withExamples switch and validates the RPC response", async () => {
    const registerTool = vi.fn();
    const rpcCall = vi
      .fn()
      .mockImplementation(async (request: { params: { withExamples: boolean } }) => ({
        schema: request.params.withExamples ? "schema\nexamples" : "schema",
      }));
    registerDescribeWorkflowSchemaTool(
      { registerTool } as unknown as McpServer,
      { call: rpcCall } as unknown as WorkflowRpcClient
    );
    const tool = registration(registerTool);
    const controller = new AbortController();

    const withoutExamples = await runWithRequestContext(context("parent-1"), () =>
      tool.handler({}, { signal: controller.signal })
    );
    const withExamples = await runWithRequestContext(context("parent-1"), () =>
      tool.handler({ withExamples: true }, { signal: controller.signal })
    );

    expect(rpcCall.mock.calls.map(([request]) => request.params)).toEqual([
      { withExamples: false },
      { withExamples: true },
    ]);
    expect(withoutExamples).toMatchObject({
      structuredContent: { schema: "schema" },
    });
    expect(withExamples).toMatchObject({
      structuredContent: { schema: "schema\nexamples" },
    });
  });

  it("rejects a non-chat caller before making an RPC request", async () => {
    const registerTool = vi.fn();
    const rpcCall = vi.fn();
    registerDescribeWorkflowSchemaTool(
      { registerTool } as unknown as McpServer,
      { call: rpcCall } as unknown as WorkflowRpcClient
    );
    const tool = registration(registerTool);

    const result = await runWithRequestContext(context(), () =>
      tool.handler({}, { signal: new AbortController().signal })
    );

    expect(result).toMatchObject({
      isError: true,
      structuredContent: { error: { code: "WORKFLOW_INVALID_CALLER" } },
    });
    expect(rpcCall).not.toHaveBeenCalled();
  });
});
