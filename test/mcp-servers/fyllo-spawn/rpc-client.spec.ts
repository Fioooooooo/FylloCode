import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { FYLLO_SPAWN_RPC_PROTOCOL, FYLLO_SPAWN_RPC_VERSION } from "@shared/types/fyllo-spawn-rpc";
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
});
