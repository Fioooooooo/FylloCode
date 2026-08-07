import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  FYLLO_SPAWN_RPC_PROTOCOL,
  FYLLO_SPAWN_RPC_VERSION,
  type FylloSpawnRpcRequest,
} from "@shared/types/fyllo-spawn-rpc";

const mocks = vi.hoisted(() => ({
  register: vi.fn(),
  unregister: vi.fn(),
  availableAgents: vi.fn(),
  promptToAgent: vi.fn(),
  checkSessionStatus: vi.fn(),
  readResponse: vi.fn(),
  handler: undefined as
    ((request: FylloSpawnRpcRequest, signal: AbortSignal) => Promise<unknown>) | undefined,
}));

vi.mock("@main/infra/mcp/bundled-mcp-host", () => ({
  registerBundledMcpRpcHandler: mocks.register,
}));

vi.mock("@main/services/session/spawn/spawned-session-manager", () => ({
  spawnedSessionManager: {
    availableAgents: mocks.availableAgents,
    promptToAgent: mocks.promptToAgent,
    checkSessionStatus: mocks.checkSessionStatus,
    readResponse: mocks.readResponse,
  },
}));

import {
  registerSpawnRpcBridge,
  unregisterSpawnRpcBridge,
} from "@main/services/session/spawn/spawn-rpc-bridge";

function request(
  method: FylloSpawnRpcRequest["method"],
  params: Record<string, unknown>
): FylloSpawnRpcRequest {
  return {
    protocol: FYLLO_SPAWN_RPC_PROTOCOL,
    version: FYLLO_SPAWN_RPC_VERSION,
    kind: "request",
    requestId: "request-1",
    caller: { workspaceId: "workspace-1", parentSessionId: "parent-1" },
    method,
    params,
  } as FylloSpawnRpcRequest;
}

describe("spawn-rpc-bridge", () => {
  beforeEach(() => {
    unregisterSpawnRpcBridge();
    vi.clearAllMocks();
    mocks.handler = undefined;
    mocks.register.mockImplementation((_name, handler) => {
      mocks.handler = handler;
      return mocks.unregister;
    });
  });

  it("显式注册一次并把可信 caller 与 AbortSignal 交给 manager", async () => {
    mocks.promptToAgent.mockResolvedValue({
      status: "completed",
      sessionId: "spawn-1",
      responseId: "response-1",
      content: "ok",
      truncated: false,
      config: [],
      warnings: [],
    });
    registerSpawnRpcBridge();
    registerSpawnRpcBridge();
    const controller = new AbortController();

    await expect(
      mocks.handler?.(
        request("prompt_to_agent", { agentId: "agent-1", prompt: "work" }),
        controller.signal
      )
    ).resolves.toMatchObject({ status: "completed", content: "ok" });
    expect(mocks.register).toHaveBeenCalledOnce();
    expect(mocks.register).toHaveBeenCalledWith("fyllo-spawn", expect.any(Function));
    expect(mocks.promptToAgent).toHaveBeenCalledWith(
      { workspaceId: "workspace-1", parentSessionId: "parent-1" },
      { agentId: "agent-1", prompt: "work" },
      controller.signal
    );
  });

  it("注销 bridge 后调用 transport disposer", () => {
    registerSpawnRpcBridge();
    unregisterSpawnRpcBridge();
    unregisterSpawnRpcBridge();
    expect(mocks.unregister).toHaveBeenCalledOnce();
  });
});
