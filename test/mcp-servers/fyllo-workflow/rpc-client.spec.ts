import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  FYLLO_WORKFLOW_RPC_PROTOCOL,
  FYLLO_WORKFLOW_RPC_VERSION,
  type WorkflowRpcCaller,
} from "../../../src/mcp-servers/fyllo-workflow/src/rpc-schema";
import { WorkflowRpcClient } from "../../../src/mcp-servers/fyllo-workflow/src/rpc-client";

class FakeIpc extends EventEmitter {
  connected = true;
  sent: unknown[] = [];

  send(message: unknown): boolean {
    this.sent.push(message);
    return true;
  }
}

const caller: WorkflowRpcCaller = {
  workspaceId: "workspace-1",
  parentSessionId: "parent-1",
  callerType: "chat",
};

function requestId(ipc: FakeIpc): string {
  return (ipc.sent[0] as { requestId: string }).requestId;
}

describe("WorkflowRpcClient", () => {
  it("correlates a response by requestId and keeps the workflow protocol independent", async () => {
    const ipc = new FakeIpc();
    const client = new WorkflowRpcClient(ipc as unknown as NodeJS.Process);
    const result = client.call({
      method: "list_workflows",
      caller,
      params: {},
      resultSchema: z.object({ workflows: z.array(z.object({ workflowId: z.string() })) }),
    });

    expect(ipc.sent[0]).toMatchObject({
      protocol: FYLLO_WORKFLOW_RPC_PROTOCOL,
      version: FYLLO_WORKFLOW_RPC_VERSION,
      kind: "request",
      method: "list_workflows",
      caller,
    });
    ipc.emit("message", {
      protocol: FYLLO_WORKFLOW_RPC_PROTOCOL,
      version: FYLLO_WORKFLOW_RPC_VERSION,
      kind: "response",
      requestId: requestId(ipc),
      ok: true,
      result: { workflows: [{ workflowId: "workflow-1" }] },
    });

    await expect(result).resolves.toEqual({ workflows: [{ workflowId: "workflow-1" }] });
    client.close();
  });

  it("forwards cancellation and rejects pending work on disconnect", async () => {
    const ipc = new FakeIpc();
    const client = new WorkflowRpcClient(ipc as unknown as NodeJS.Process);
    const controller = new AbortController();
    const result = client.call({
      method: "trigger_workflow",
      caller,
      params: { workflowId: "workflow-1" },
      resultSchema: z.unknown(),
      signal: controller.signal,
    });

    controller.abort();
    await expect(result).rejects.toMatchObject({ code: "WORKFLOW_RPC_CANCELLED" });
    expect(ipc.sent[1]).toMatchObject({
      protocol: FYLLO_WORKFLOW_RPC_PROTOCOL,
      kind: "cancel",
      requestId: requestId(ipc),
    });
    client.close();

    const disconnectedIpc = new FakeIpc();
    const disconnectedClient = new WorkflowRpcClient(disconnectedIpc as unknown as NodeJS.Process);
    const disconnected = disconnectedClient.call({
      method: "list_workflows",
      caller,
      params: {},
      resultSchema: z.unknown(),
    });
    disconnectedIpc.connected = false;
    disconnectedIpc.emit("disconnect");
    await expect(disconnected).rejects.toMatchObject({ code: "WORKFLOW_RPC_UNAVAILABLE" });
  });
});
