import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { parseMcpWorkspaceDescriptor } from "@shared/types/mcp-workspace";
import { runWithRequestContext } from "../../../src/mcp-servers/shared/request-context";
import { registerTools } from "../../../src/mcp-servers/fyllo-spawn/src/tools";
import { callerFromContext } from "../../../src/mcp-servers/fyllo-spawn/src/tools/shared";
import type { SpawnRpcClient } from "../../../src/mcp-servers/fyllo-spawn/src/rpc-client";

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
    expect(description).toContain("optional spawn.session Signal");
    expect(description).toContain("not required for discovery");
    expect(description).toContain("do not repeat it for continuation calls");
    expect(description).toContain("Main-owned activity view remains the source of truth");
    expect(description).toContain("omitting folderId inherits the complete parent Workspace");
    expect(description).toContain("folderId only on a new call (omit sessionId)");
    expect(description).toContain("Continuations must provide sessionId without folderId");
    expect(description).toContain("choose an Agent that supports additional directories");
    expect(description).toContain("semantic model and thought_level values directly");
    expect(description).toContain("no probe is needed");
    expect(description).toContain("configuration_required");
    expect(description).toContain("promptDispatched=false");
    expect(description).toContain("SPAWN_CONFIG_FAILED");
    expect(description).toContain(
      "initialize, available_agents, and static capability caches do not provide them"
    );
    expect(description).not.toContain("responsePath");
    expect(description).not.toContain("app-data");
    expect(description).not.toContain('{"sessionId"');

    const inputShape = (
      promptRegistration?.[1]?.inputSchema as {
        shape?: Record<
          string,
          { description?: string; _def?: { innerType?: { description?: string } } }
        >;
      }
    )?.shape;
    expect(inputShape?.folderId?.description).toContain("new Session only");
    expect(inputShape?.folderId?.description).toContain("complete Workspace");
    expect(inputShape?.sessionId?.description).toContain("omit folderId");
    expect(inputShape?.sessionId?.description).toContain("scope is fixed");
    expect(inputShape?.model?.description).toContain("not an ACP option ID");
    expect(inputShape?.model?.description).toContain("category=model");
    expect(inputShape?.thought_level?.description).toContain("category=thought_level");
    const configDescription =
      inputShape?.config?.description ?? inputShape?.config?._def?.innerType?.description;
    expect(configDescription).toContain("exact live ACP option-ID");
  });

  it("registers exactly five tools and routes each one through its matching RPC method", async () => {
    const registerTool = vi.fn();
    const rpcCall = vi.fn(
      async ({ method }: { method: string; caller: { parentSessionId: string } }) => ({ method })
    );
    registerTools(
      { registerTool } as unknown as McpServer,
      { call: rpcCall } as unknown as SpawnRpcClient
    );

    const registrations = registerTool.mock.calls.map(([name, config, handler]) => ({
      name,
      config,
      handler,
    })) as ToolRegistration[];

    expect(registrations.map(({ name }) => name)).toEqual([
      "available_agents",
      "prompt_to_agent",
      "check_session_status",
      "read_response",
      "cancel_session",
    ]);

    const inputs: Record<string, Record<string, unknown>> = {
      available_agents: {},
      prompt_to_agent: { agentId: "codex", prompt: "Inspect one focused area" },
      check_session_status: { sessionId: "spawn-1" },
      read_response: { sessionId: "spawn-1", responseId: "response-1" },
      cancel_session: { sessionId: "spawn-1" },
    };
    const controller = new AbortController();

    await runWithRequestContext(context("parent-1"), async () => {
      for (const registration of registrations) {
        await registration.handler(inputs[registration.name] ?? {}, {
          signal: controller.signal,
        });
      }
    });

    expect(rpcCall.mock.calls.map(([request]) => request.method)).toEqual([
      "available_agents",
      "prompt_to_agent",
      "check_session_status",
      "read_response",
      "cancel_session",
    ]);
    expect(
      rpcCall.mock.calls.every(([request]) => request.caller.parentSessionId === "parent-1")
    ).toBe(true);
  });
});
