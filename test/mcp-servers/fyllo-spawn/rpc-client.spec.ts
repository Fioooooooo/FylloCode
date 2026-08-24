import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  FYLLO_SPAWN_RPC_PROTOCOL,
  FYLLO_SPAWN_RPC_VERSION,
  promptToAgentResultSchema,
} from "@shared/types/fyllo-spawn-rpc";
import { SpawnRpcClient } from "../../../src/mcp-servers/fyllo-spawn/src/rpc-client";

class FakeIpc extends EventEmitter {
  connected = true;
  sent: unknown[] = [];

  send(message: unknown): boolean {
    this.sent.push(message);
    return true;
  }
}

function requestId(fake: FakeIpc): string {
  return (fake.sent[0] as { requestId: string }).requestId;
}

describe("SpawnRpcClient", () => {
  it("correlates concurrent-safe responses by requestId", async () => {
    const ipc = new FakeIpc();
    const client = new SpawnRpcClient(ipc as unknown as NodeJS.Process);
    const result = client.call({
      method: "available_agents",
      caller: { workspaceId: "workspace-1", parentSessionId: "parent-1" },
      params: {},
      resultSchema: z.object({ value: z.string() }),
    });

    ipc.emit("message", {
      protocol: FYLLO_SPAWN_RPC_PROTOCOL,
      version: FYLLO_SPAWN_RPC_VERSION,
      kind: "response",
      requestId: requestId(ipc),
      ok: true,
      result: { value: "done" },
    });

    await expect(result).resolves.toEqual({ value: "done" });
    client.close();
  });

  it("sends cancel and rejects when the MCP request aborts", async () => {
    const ipc = new FakeIpc();
    const client = new SpawnRpcClient(ipc as unknown as NodeJS.Process);
    const controller = new AbortController();
    const result = client.call({
      method: "check_session_status",
      caller: { workspaceId: "workspace-1", parentSessionId: "parent-1" },
      params: { sessionId: "spawn-1" },
      resultSchema: z.unknown(),
      signal: controller.signal,
    });

    controller.abort();

    await expect(result).rejects.toMatchObject({
      code: "SPAWN_RPC_CANCELLED",
    });
    expect(ipc.sent[1]).toMatchObject({ kind: "cancel", requestId: requestId(ipc) });
    client.close();
  });

  it("rejects all pending work when the parent IPC channel disconnects", async () => {
    const ipc = new FakeIpc();
    const client = new SpawnRpcClient(ipc as unknown as NodeJS.Process);
    const result = client.call({
      method: "available_agents",
      caller: { workspaceId: "workspace-1", parentSessionId: "parent-1" },
      params: {},
      resultSchema: z.unknown(),
    });

    ipc.connected = false;
    ipc.emit("disconnect");

    await expect(result).rejects.toMatchObject({
      code: "SPAWN_RPC_UNAVAILABLE",
    });
  });

  it("round-trips configuration_required and maps SPAWN_CONFIG_FAILED", async () => {
    const ipc = new FakeIpc();
    const client = new SpawnRpcClient(ipc as unknown as NodeJS.Process);
    const required = {
      status: "configuration_required",
      sessionId: "spawn-1",
      promptDispatched: false,
      config: [],
      issues: [
        {
          parameter: "model",
          reason: "unsupported",
          requested: "missing-model",
          candidates: [],
        },
      ],
    } as const;
    const result = client.call({
      method: "prompt_to_agent",
      caller: { workspaceId: "workspace-1", parentSessionId: "parent-1" },
      params: { agentId: "agent-1", prompt: "work", model: "missing-model" },
      resultSchema: promptToAgentResultSchema,
    });
    ipc.emit("message", {
      protocol: FYLLO_SPAWN_RPC_PROTOCOL,
      version: FYLLO_SPAWN_RPC_VERSION,
      kind: "response",
      requestId: requestId(ipc),
      ok: true,
      result: required,
    });
    await expect(result).resolves.toEqual(required);
    client.close();

    const failedIpc = new FakeIpc();
    const failedClient = new SpawnRpcClient(failedIpc as unknown as NodeJS.Process);
    const failed = failedClient.call({
      method: "prompt_to_agent",
      caller: { workspaceId: "workspace-1", parentSessionId: "parent-1" },
      params: { agentId: "agent-1", prompt: "work", model: "o3" },
      resultSchema: promptToAgentResultSchema,
    });
    failedIpc.emit("message", {
      protocol: FYLLO_SPAWN_RPC_PROTOCOL,
      version: FYLLO_SPAWN_RPC_VERSION,
      kind: "response",
      requestId: requestId(failedIpc),
      ok: false,
      error: {
        code: "SPAWN_CONFIG_FAILED",
        message: "live config snapshot was incomplete",
      },
    });
    await expect(failed).rejects.toMatchObject({
      code: "SPAWN_CONFIG_FAILED",
      message: "live config snapshot was incomplete",
      retryable: false,
    });
    failedClient.close();
  });
});
