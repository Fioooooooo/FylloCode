import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SpawnedTurnRecord } from "@main/infra/storage/spawned-session-store";

const mocks = vi.hoisted(() => ({
  messages: [] as Array<{ workspaceId: string; sessionId: string; message: unknown }>,
  list: vi.fn(),
  claim: vi.fn(),
  buildReminder: vi.fn(),
  markDelivered: vi.fn(),
  markDeliveryUnknown: vi.fn(),
  loadSessionMeta: vi.fn(),
  patchSessionMeta: vi.fn(),
  appendMessage: vi.fn(),
  sessions: [] as Array<EventEmitter & { opts: Record<string, unknown> }>,
  startError: null as Error | null,
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
  dispatchSpawnNotification,
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

describe("chat-turn-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetSessionRegistryForTests();
    mocks.messages.length = 0;
    mocks.sessions.length = 0;
    mocks.startError = null;
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
      mocks.messages.push({ workspaceId, sessionId, message });
    });
  });

  it("claim 后由 Main 生成独立 user reminder，并在 assistant durable 后 delivered", async () => {
    await expect(dispatchSpawnNotification("workspace-1", "notification-1")).resolves.toEqual({
      status: "dispatched",
    });
    await vi.waitFor(() => expect(mocks.markDelivered).toHaveBeenCalledOnce());

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
    await expect(dispatchSpawnNotification("workspace-1", "notification-1")).resolves.toEqual({
      status: "busy",
    });
    expect(mocks.claim).not.toHaveBeenCalled();
    lease?.release();
  });

  it("ACP start 在 terminal 前失败会 delivery_unknown 并释放 gate", async () => {
    mocks.startError = new Error("prepare failed");

    await expect(dispatchSpawnNotification("workspace-1", "notification-1")).resolves.toEqual({
      status: "dispatched",
    });

    expect(mocks.markDeliveryUnknown).toHaveBeenCalledOnce();
    expect(chatTurnGate.isActive("workspace-1", "parent-1")).toBe(false);
  });

  it("普通用户与通知使用同一 gate，不允许 registry 覆盖", async () => {
    const output = { sendChunk: vi.fn(), sendDone: vi.fn(), sendError: vi.fn() };
    const runner = await createRendererChatTurn(
      {
        workspaceId: "workspace-1",
        sessionId: "parent-1",
        agentId: "agent-1",
        prompt: [{ type: "text", text: "user prompt" }],
      },
      output
    );
    await expect(dispatchSpawnNotification("workspace-1", "notification-1")).resolves.toEqual({
      status: "busy",
    });
    await runner.start();
    await runner.completion;
    await expect(dispatchSpawnNotification("workspace-1", "notification-1")).resolves.toEqual({
      status: "dispatched",
    });
  });
});
