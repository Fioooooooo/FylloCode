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
  cancelSession: vi.fn(),
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
    cancelSession: mocks.cancelSession,
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

  it("直接返回 manager 的 background accepted snapshot", async () => {
    const accepted = {
      status: "accepted",
      sessionId: "spawn-1",
      turnId: "turn-1",
      startedAt: new Date().toISOString(),
      config: [],
      warnings: [],
    };
    mocks.promptToAgent.mockResolvedValue(accepted);
    registerSpawnRpcBridge();
    const controller = new AbortController();

    await expect(
      mocks.handler?.(
        request("prompt_to_agent", {
          agentId: "agent-1",
          prompt: "work",
          background: true,
        }),
        controller.signal
      )
    ).resolves.toEqual(accepted);
    expect(mocks.promptToAgent).toHaveBeenCalledWith(
      { workspaceId: "workspace-1", parentSessionId: "parent-1" },
      { agentId: "agent-1", prompt: "work", background: true },
      controller.signal
    );
  });

  it("透传 semantic config 参数并保留 configuration_required 结构化结果", async () => {
    const required = {
      status: "configuration_required",
      sessionId: "spawn-1",
      promptDispatched: false,
      config: [{ id: "model", name: "Model", type: "select", currentValue: "default" }],
      issues: [
        {
          parameter: "model",
          reason: "ambiguous",
          requested: "luna",
          optionId: "model",
          category: "model",
          candidates: [
            { value: "openai/luna", name: "Luna", group: "OpenAI" },
            { value: "router/luna", name: "Luna", group: "Router" },
          ],
        },
      ],
    } as const;
    mocks.promptToAgent.mockResolvedValue(required);
    registerSpawnRpcBridge();
    const controller = new AbortController();
    const params = {
      agentId: "agent-1",
      prompt: "work",
      model: "luna",
      thought_level: "high",
      config: { mode: "background", "model.config": "fast" },
      background: false,
    };

    await expect(
      mocks.handler?.(request("prompt_to_agent", params), controller.signal)
    ).resolves.toEqual(required);
    expect(mocks.promptToAgent).toHaveBeenCalledWith(
      { workspaceId: "workspace-1", parentSessionId: "parent-1" },
      params,
      controller.signal
    );
  });

  it("通过 bridge 暴露 SPAWN_CONFIG_FAILED 以便上层 RPC 映射", async () => {
    const error = Object.assign(new Error("live config snapshot was incomplete"), {
      code: "SPAWN_CONFIG_FAILED",
    });
    mocks.promptToAgent.mockRejectedValue(error);
    registerSpawnRpcBridge();

    await expect(
      mocks.handler?.(
        request("prompt_to_agent", {
          agentId: "agent-1",
          prompt: "work",
          model: "o3",
        }),
        new AbortController().signal
      )
    ).rejects.toMatchObject({ code: "SPAWN_CONFIG_FAILED" });
  });

  it("cancel_session 路由到 manager.cancelSession 并按 schema 校验返回值", async () => {
    mocks.cancelSession.mockResolvedValue({ cancelled: true });
    registerSpawnRpcBridge();
    const controller = new AbortController();

    await expect(
      mocks.handler?.(request("cancel_session", { sessionId: "spawn-1" }), controller.signal)
    ).resolves.toEqual({ cancelled: true });
    expect(mocks.cancelSession).toHaveBeenCalledWith(
      { workspaceId: "workspace-1", parentSessionId: "parent-1" },
      "spawn-1"
    );

    mocks.cancelSession.mockResolvedValue({ cancelled: false, reason: "Session not found" });
    await expect(
      mocks.handler?.(request("cancel_session", { sessionId: "missing" }), controller.signal)
    ).resolves.toEqual({ cancelled: false, reason: "Session not found" });

    mocks.cancelSession.mockResolvedValue({ cancelled: "yes" });
    await expect(
      mocks.handler?.(request("cancel_session", { sessionId: "spawn-1" }), controller.signal)
    ).rejects.toThrow();
  });

  it("注销 bridge 后调用 transport disposer", () => {
    registerSpawnRpcBridge();
    unregisterSpawnRpcBridge();
    unregisterSpawnRpcBridge();
    expect(mocks.unregister).toHaveBeenCalledOnce();
  });
});
