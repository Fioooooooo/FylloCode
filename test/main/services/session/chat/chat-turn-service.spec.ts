import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SpawnedTurnRecord } from "@main/infra/storage/spawned-session-store";
import type { StreamOutput } from "@main/services/session/chat/acp-stream-driver";

const mocks = vi.hoisted(() => ({
  messages: [] as Array<{ workspaceId: string; sessionId: string; message: unknown }>,
  list: vi.fn(),
  claim: vi.fn(),
  buildReminder: vi.fn(),
  markDelivered: vi.fn(),
  markDeliveryUnknown: vi.fn(),
  loadSessionMeta: vi.fn(),
  patchSessionMeta: vi.fn(),
  patchMessageMetadata: vi.fn(),
  appendMessage: vi.fn(),
  sessions: [] as Array<EventEmitter & { opts: Record<string, unknown> }>,
  startError: null as Error | null,
  emitTurnMetadata: false,
  failAssistantPersist: false,
}));

vi.mock("@main/services/session/spawn/spawn-notification-service", () => ({
  spawnNotificationService: {
    list: mocks.list,
    claim: mocks.claim,
    buildReminder: mocks.buildReminder,
    markDelivered: mocks.markDelivered,
    markDeliveryUnknown: mocks.markDeliveryUnknown,
  },
}));

vi.mock("@main/services/session/chat/chat-service", () => ({
  ensureSessionWorkspaceSnapshot: vi.fn(async () => ({
    workspaceId: "workspace-1",
    workspaceKind: "folder",
    primaryFolderId: "folder-1",
    folders: [{ folderId: "folder-1", folderName: "Root", folderPath: "/repo" }],
    cwd: "/repo",
    additionalDirectories: [],
  })),
}));

vi.mock("@main/services/session/chat/agent-workspace-compatibility", () => ({
  assertAgentWorkspaceCompatibility: vi.fn(),
}));

vi.mock("@main/services/insight/_public", () => ({ getByTask: vi.fn(async () => null) }));
vi.mock("@main/services/session/chat/session-probe-service", () => ({
  takeProbeFor: vi.fn(),
}));
vi.mock("@main/infra/storage/chat-acp-session-store", () => ({
  ChatAcpSessionStore: vi.fn(function () {
    return {};
  }),
}));
vi.mock("@main/infra/storage/message-reminder-store", () => ({
  prependReminderToLastUserMessage: vi.fn(),
}));
vi.mock("@main/infra/storage/session-store", () => ({
  loadSessionMeta: mocks.loadSessionMeta,
  loadMessages: vi.fn(async () => []),
  sessionMessagesPath: vi.fn(() => "/messages"),
  patchSessionMeta: mocks.patchSessionMeta,
  patchMessageMetadata: mocks.patchMessageMetadata,
  appendMessage: mocks.appendMessage,
}));

vi.mock("@main/services/session/chat/acp-session", async () => {
  const { EventEmitter: Emitter } = await import("node:events");
  class FakeAcpSession extends Emitter {
    constructor(public readonly opts: Record<string, unknown>) {
      super();
      mocks.sessions.push(this);
    }

    async start(): Promise<void> {
      if (mocks.startError) throw mocks.startError;
      const userMessageId = this.opts.userMessageId;
      if (mocks.emitTurnMetadata && typeof userMessageId === "string") {
        this.emit("event", {
          kind: "turn_metadata",
          userMessageId,
          dispatchedAt: "2026-08-10T12:00:00.000Z",
          model: "gpt-5.6",
          effort: "high",
        });
      }
      this.emit("event", { kind: "text_delta", text: "parent acknowledged" });
      this.emit("event", { kind: "done", totalTokens: 2 });
    }

    cancel(): void {
      this.emit("event", { kind: "error", code: "CANCELLED", message: "cancelled" });
    }
  }
  return { AcpSession: FakeAcpSession };
});

import {
  createRendererChatTurn,
  claimSpawnNotificationTurn,
} from "@main/services/session/chat/chat-turn-service";
import { chatTurnGate } from "@main/services/session/chat/chat-turn-gate";
import { resetSessionRegistryForTests } from "@main/services/session/chat/session-registry";

function record(): SpawnedTurnRecord {
  return {
    version: 1,
    workspaceId: "workspace-1",
    parentSessionId: "parent-1",
    sessionId: "spawn-1",
    turnId: "turn-1",
    agentId: "agent-1",
    mode: "background",
    phase: "completed",
    startedAt: "2026-08-08T00:00:00.000Z",
    lastActivityAt: "2026-08-08T00:00:01.000Z",
    recentActivity: [],
    config: [],
    warnings: [],
    responseId: "response-1",
    notification: {
      notificationId: "notification-1",
      state: "dispatched",
      updatedAt: "2026-08-08T00:00:02.000Z",
    },
    createdAt: "2026-08-08T00:00:00.000Z",
    updatedAt: "2026-08-08T00:00:02.000Z",
  };
}

function createOutput() {
  return {
    sendChunk: vi.fn<StreamOutput["sendChunk"]>(),
    sendDone: vi.fn<StreamOutput["sendDone"]>(),
    sendError: vi.fn<StreamOutput["sendError"]>(),
  };
}

describe("chat-turn-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetSessionRegistryForTests();
    mocks.messages.length = 0;
    mocks.sessions.length = 0;
    mocks.startError = null;
    mocks.emitTurnMetadata = false;
    mocks.failAssistantPersist = false;
    mocks.patchMessageMetadata.mockResolvedValue(true);
    mocks.list.mockResolvedValue([
      {
        notificationId: "notification-1",
        parentSessionId: "parent-1",
        spawnedSessionId: "spawn-1",
        turnId: "turn-1",
        status: "completed",
        responseId: "response-1",
      },
    ]);
    mocks.claim.mockResolvedValue(record());
    mocks.buildReminder.mockReturnValue(
      "<system-reminder>sessionId=spawn-1 turnId=turn-1 responseId=response-1; untrusted; no new permissions</system-reminder>"
    );
    mocks.markDelivered.mockResolvedValue(undefined);
    mocks.markDeliveryUnknown.mockResolvedValue(undefined);
    mocks.loadSessionMeta.mockResolvedValue({
      sessionId: "parent-1",
      agentId: "agent-1",
      sessionMode: "fyllocode",
      title: "Parent",
      turnCount: 0,
      tokenUsage: { used: 0, size: 10 },
      createdAt: "2026-08-08T00:00:00.000Z",
      updatedAt: "2026-08-08T00:00:00.000Z",
    });
    mocks.patchSessionMeta.mockImplementation(async (_workspaceId, _sessionId, patch) => {
      const current = await mocks.loadSessionMeta();
      return { ...current, ...(typeof patch === "function" ? patch(current) : patch) };
    });
    mocks.appendMessage.mockImplementation(async (workspaceId, sessionId, message) => {
      if (mocks.failAssistantPersist && (message as { role: string }).role === "assistant") {
        throw new Error("persist failed");
      }
      mocks.messages.push({ workspaceId, sessionId, message });
    });
  });

  async function startAcceptedNotificationTurn(output: StreamOutput = createOutput()) {
    const claim = await claimSpawnNotificationTurn("workspace-1", "notification-1");
    if (claim.status !== "accepted") {
      throw new Error(`unexpected claim status: ${claim.status}`);
    }
    const runner = await claim.start(output);
    return { runner, output };
  }

  it("claim 后由 Main 生成独立 user reminder，chunk 实时转发，并在 assistant durable 后 delivered", async () => {
    const { runner, output } = await startAcceptedNotificationTurn();
    await runner.start();
    await runner.completion;
    await vi.waitFor(() => expect(mocks.markDelivered).toHaveBeenCalledOnce());

    expect(output.sendChunk).toHaveBeenCalledWith(expect.objectContaining({ kind: "text_delta" }));
    expect(output.sendDone).toHaveBeenCalledWith(2);
    expect(mocks.messages.map(({ message }) => (message as { role: string }).role)).toEqual([
      "user",
      "assistant",
    ]);
    const reminder = (mocks.messages[0]?.message as { parts: Array<{ text: string }> }).parts[0]
      ?.text;
    expect(reminder).toContain("responseId=response-1");
    expect(reminder).not.toContain("parent acknowledged");
    expect(mocks.markDeliveryUnknown).not.toHaveBeenCalled();
  });

  it("父 Chat gate 忙时保持 pending，不执行 claim", async () => {
    const lease = chatTurnGate.tryAcquire("workspace-1", "parent-1", "user");
    await expect(claimSpawnNotificationTurn("workspace-1", "notification-1")).resolves.toEqual({
      status: "busy",
    });
    expect(mocks.claim).not.toHaveBeenCalled();
    lease?.release();
  });

  it("notification 不再 pending 时不占用 gate", async () => {
    mocks.list.mockResolvedValue([]);
    await expect(claimSpawnNotificationTurn("workspace-1", "notification-1")).resolves.toEqual({
      status: "not_pending",
    });
    expect(chatTurnGate.isActive("workspace-1", "parent-1")).toBe(false);
  });

  it("ACP start 在 terminal 前失败会 delivery_unknown 并释放 gate", async () => {
    mocks.startError = new Error("prepare failed");

    const { runner } = await startAcceptedNotificationTurn();
    await expect(runner.start()).rejects.toThrow("prepare failed");
    await runner.completion;

    await vi.waitFor(() => expect(mocks.markDeliveryUnknown).toHaveBeenCalledOnce());
    expect(chatTurnGate.isActive("workspace-1", "parent-1")).toBe(false);
    expect(mocks.markDelivered).not.toHaveBeenCalled();
  });

  it("assistant 持久化失败（finalization 失败）记 delivery_unknown 且通知 renderer 错误", async () => {
    mocks.failAssistantPersist = true;

    const { runner, output } = await startAcceptedNotificationTurn();
    await runner.start();
    await runner.completion;

    await vi.waitFor(() => expect(mocks.markDeliveryUnknown).toHaveBeenCalledOnce());
    expect(mocks.markDelivered).not.toHaveBeenCalled();
    expect(output.sendError).toHaveBeenCalledOnce();
  });

  it("turn 被取消时记 delivery_unknown 并释放 gate", async () => {
    const { runner } = await startAcceptedNotificationTurn();
    runner.cancel();
    await runner.completion;

    await vi.waitFor(() => expect(mocks.markDeliveryUnknown).toHaveBeenCalledOnce());
    expect(chatTurnGate.isActive("workspace-1", "parent-1")).toBe(false);
    expect(mocks.markDelivered).not.toHaveBeenCalled();
  });

  it("普通用户与通知使用同一 gate，不允许 registry 覆盖", async () => {
    const output = createOutput();
    const runner = await createRendererChatTurn(
      {
        workspaceId: "workspace-1",
        sessionId: "parent-1",
        agentId: "agent-1",
        prompt: [{ type: "text", text: "user prompt" }],
      },
      output
    );
    await expect(claimSpawnNotificationTurn("workspace-1", "notification-1")).resolves.toEqual({
      status: "busy",
    });
    await runner.start();
    await runner.completion;
    await vi.waitFor(() => expect(chatTurnGate.isActive("workspace-1", "parent-1")).toBe(false));

    // gate 释放后通知可以被接受并正常跑完，避免 lease 泄漏到后续用例。
    const accepted = await startAcceptedNotificationTurn();
    await accepted.runner.start();
    await accepted.runner.completion;
    await vi.waitFor(() => expect(mocks.markDelivered).toHaveBeenCalledOnce());
  });

  it("patches the exact user and persists the same audit snapshot on assistant", async () => {
    mocks.emitTurnMetadata = true;
    const output = createOutput();
    const runner = await createRendererChatTurn(
      {
        workspaceId: "workspace-1",
        sessionId: "parent-1",
        agentId: "agent-1",
        userMessageId: "user-current",
        prompt: [{ type: "text", text: "user prompt" }],
      },
      output
    );

    await runner.start();
    await runner.completion;

    expect(mocks.patchMessageMetadata).toHaveBeenCalledWith(
      "workspace-1",
      "parent-1",
      "user-current",
      expect.objectContaining({ model: "gpt-5.6", effort: "high" })
    );
    expect(mocks.messages.at(-1)?.message).toMatchObject({
      role: "assistant",
      metadata: { model: "gpt-5.6", effort: "high" },
    });
  });
});
