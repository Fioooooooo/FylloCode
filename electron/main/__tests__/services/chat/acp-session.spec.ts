import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InitializeResponse, SessionNotification } from "@agentclientprotocol/sdk";
import type { TextUIPart } from "ai";
import type { Message } from "@shared/types/chat";
import type { SessionEvent } from "@main/domain/chat/session-events";

const mocks = vi.hoisted(() => {
  const sessionHandlers = new Map<string, (notification: SessionNotification) => void>();
  const connection = {
    resumeSession: vi.fn(),
    loadSession: vi.fn(),
    newSession: vi.fn(),
    prompt: vi.fn(),
    cancel: vi.fn(),
  };

  return {
    connection,
    sessionHandlers,
    getOrStartProcess: vi.fn(),
    loadSessionMeta: vi.fn(),
    upsertSessionMeta: vi.fn(),
    getBundledMcpServers: vi.fn(),
    toAcpMcpServerEnv: vi.fn(),
    resolveSystemReminder: vi.fn(),
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  };
});

vi.mock("@main/infra/process/acp-process-pool", () => ({
  getOrStartProcess: mocks.getOrStartProcess,
}));

vi.mock("@main/infra/storage/session-store", () => ({
  loadSessionMeta: mocks.loadSessionMeta,
  upsertSessionMeta: mocks.upsertSessionMeta,
}));

vi.mock("@main/infra/mcp/bundled-mcp-servers", () => ({
  getBundledMcpServers: mocks.getBundledMcpServers,
  toAcpMcpServerEnv: mocks.toAcpMcpServerEnv,
}));

vi.mock("@main/services/chat/system-reminder", () => ({
  resolveSystemReminder: mocks.resolveSystemReminder,
}));

vi.mock("@main/domain/chat/system-reminder-wrap", () => ({
  wrapAsSystemReminder: (body: string) => `<system-reminder>\n${body}\n</system-reminder>`,
}));

vi.mock("@main/infra/logger", () => ({
  default: mocks.logger,
}));

vi.mock("@main/services/chat/acp-mapper", () => ({
  mapSessionUpdate: vi.fn((update: unknown) => update ?? null),
}));

function initializeResponse(overrides: Partial<InitializeResponse> = {}): InitializeResponse {
  return {
    protocolVersion: 1,
    agentCapabilities: {
      loadSession: true,
      sessionCapabilities: { resume: {}, close: {}, list: {} },
    },
    ...overrides,
  } as InitializeResponse;
}

describe("AcpSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sessionHandlers.clear();
    mocks.getOrStartProcess.mockResolvedValue({
      connection: mocks.connection,
      sessionHandlers: mocks.sessionHandlers,
      initializeResponse: initializeResponse(),
    });
    mocks.connection.resumeSession.mockResolvedValue(undefined);
    mocks.connection.loadSession.mockResolvedValue(undefined);
    mocks.connection.newSession.mockResolvedValue({ sessionId: "acp-new" });
    mocks.connection.prompt.mockResolvedValue({ usage: { outputTokens: 12 } });
    mocks.loadSessionMeta.mockResolvedValue({
      sessionId: "session-1",
      acpSessionId: undefined,
      agentId: "claude-acp",
      title: "Session",
      turnCount: 0,
      tokenUsage: { used: 0, size: 0 },
      createdAt: "2026-05-08T00:00:00.000Z",
      updatedAt: "2026-05-08T00:00:00.000Z",
    });
    mocks.upsertSessionMeta.mockImplementation(async (_projectPath, _sessionId, create, update) => {
      const current = await mocks.loadSessionMeta();
      const base = current ?? create();
      const patch = typeof update === "function" ? update(base) : update;
      return { ...base, ...patch };
    });
    mocks.getBundledMcpServers.mockReturnValue([]);
    mocks.toAcpMcpServerEnv.mockImplementation((env: unknown) => env);
    mocks.resolveSystemReminder.mockResolvedValue(null);
  });

  async function createSession(
    overrides: Partial<import("@main/services/chat/acp-session").AcpSessionOpts> = {}
  ): Promise<import("@main/services/chat/acp-session").AcpSession> {
    const { AcpSession } = await import("@main/services/chat/acp-session");
    return new AcpSession({
      fylloSessionId: "session-1",
      agentId: "claude-acp",
      projectPath: "/tmp/project",
      cwd: "/tmp/project",
      owner: "chat",
      ...overrides,
    });
  }

  it("injects reminder and calls the hook on a fresh newSession", async () => {
    const reminderPart: TextUIPart = {
      type: "text",
      text: "<system-reminder>\nbody\n</system-reminder>",
    };
    const onReminderInjected = vi.fn().mockResolvedValue(undefined);
    mocks.resolveSystemReminder.mockResolvedValue(reminderPart);

    const session = await createSession({ onReminderInjected });
    await session.start("hello");

    expect(mocks.connection.newSession).toHaveBeenCalledTimes(1);
    expect(onReminderInjected).toHaveBeenCalledWith(reminderPart);
    expect(mocks.connection.prompt).toHaveBeenCalledWith({
      sessionId: "acp-new",
      prompt: [reminderPart, { type: "text", text: "hello" }],
    });
  });

  it("uses direct prompt first when persisted acpSessionId exists", async () => {
    mocks.loadSessionMeta.mockResolvedValue({
      sessionId: "session-1",
      acpSessionId: "acp-existing",
      agentId: "claude-acp",
      title: "Session",
      turnCount: 1,
      tokenUsage: { used: 0, size: 0 },
      createdAt: "2026-05-08T00:00:00.000Z",
      updatedAt: "2026-05-08T00:00:00.000Z",
    });

    const session = await createSession();
    await session.start("hello");

    expect(mocks.connection.prompt).toHaveBeenCalledWith({
      sessionId: "acp-existing",
      prompt: [{ type: "text", text: "hello" }],
    });
    expect(mocks.connection.resumeSession).not.toHaveBeenCalled();
    expect(mocks.connection.loadSession).not.toHaveBeenCalled();
    expect(mocks.resolveSystemReminder).not.toHaveBeenCalled();
  });

  it("falls back to resumeSession on classified direct prompt missing-session failure", async () => {
    mocks.loadSessionMeta.mockResolvedValue({
      sessionId: "session-1",
      acpSessionId: "acp-existing",
      agentId: "claude-acp",
      title: "Session",
      turnCount: 1,
      tokenUsage: { used: 0, size: 0 },
      createdAt: "2026-05-08T00:00:00.000Z",
      updatedAt: "2026-05-08T00:00:00.000Z",
    });
    mocks.connection.prompt
      .mockRejectedValueOnce({
        code: -32603,
        message: "Internal error",
        data: { details: "Session not found" },
      })
      .mockResolvedValueOnce({ usage: { outputTokens: 4 } });

    const session = await createSession();
    await session.start("hello");

    expect(mocks.connection.resumeSession).toHaveBeenCalledWith({
      sessionId: "acp-existing",
      cwd: "/tmp/project",
      mcpServers: [],
    });
    expect(mocks.connection.loadSession).not.toHaveBeenCalled();
    expect(mocks.connection.prompt).toHaveBeenLastCalledWith({
      sessionId: "acp-existing",
      prompt: [{ type: "text", text: "hello" }],
    });
  });

  it("uses loadSession when resume is unsupported", async () => {
    mocks.getOrStartProcess.mockResolvedValue({
      connection: mocks.connection,
      sessionHandlers: mocks.sessionHandlers,
      initializeResponse: initializeResponse({
        agentCapabilities: {
          loadSession: true,
          sessionCapabilities: { close: {}, list: {} },
        },
      }),
    });
    mocks.loadSessionMeta.mockResolvedValue({
      sessionId: "session-1",
      acpSessionId: "acp-existing",
      agentId: "claude-acp",
      title: "Session",
      turnCount: 1,
      tokenUsage: { used: 0, size: 0 },
      createdAt: "2026-05-08T00:00:00.000Z",
      updatedAt: "2026-05-08T00:00:00.000Z",
    });
    mocks.connection.prompt
      .mockRejectedValueOnce({ code: -32602, message: "Session not found: acp-existing" })
      .mockResolvedValueOnce({ usage: { outputTokens: 4 } });

    const session = await createSession({
      recoveryContext: {
        hasPersistedHistory: true,
        loadPersistedHistory: async () => [],
      },
    });
    await session.start("hello");

    expect(mocks.connection.resumeSession).not.toHaveBeenCalled();
    expect(mocks.connection.loadSession).toHaveBeenCalledWith({
      sessionId: "acp-existing",
      cwd: "/tmp/project",
      mcpServers: [],
    });
  });

  it("does not auto-recover when direct prompt failure happens after an update", async () => {
    mocks.loadSessionMeta.mockResolvedValue({
      sessionId: "session-1",
      acpSessionId: "acp-existing",
      agentId: "claude-acp",
      title: "Session",
      turnCount: 1,
      tokenUsage: { used: 0, size: 0 },
      createdAt: "2026-05-08T00:00:00.000Z",
      updatedAt: "2026-05-08T00:00:00.000Z",
    });
    mocks.connection.prompt.mockImplementationOnce(async () => {
      const handler = mocks.sessionHandlers.get("acp-existing");
      handler?.({
        sessionId: "acp-existing",
        update: { type: "text_delta", text: "partial" } as unknown as SessionNotification["update"],
      } as SessionNotification);
      throw { code: -32603, message: "Internal error", data: { details: "Session not found" } };
    });

    const session = await createSession();
    const seen: SessionEvent[] = [];
    session.on("event", (event) => seen.push(event));
    await session.start("hello");

    expect(mocks.connection.resumeSession).not.toHaveBeenCalled();
    expect(mocks.connection.loadSession).not.toHaveBeenCalled();
    expect(seen).toContainEqual({ type: "text_delta", text: "partial" });
    expect(seen).toContainEqual({
      type: "error",
      code: "ACP_ERROR",
      message: "Internal error",
    });
  });

  it("suppresses replayed message events during loadSession when local history exists", async () => {
    mocks.getOrStartProcess.mockResolvedValue({
      connection: mocks.connection,
      sessionHandlers: mocks.sessionHandlers,
      initializeResponse: initializeResponse({
        agentCapabilities: {
          loadSession: true,
          sessionCapabilities: { close: {}, list: {} },
        },
      }),
    });
    mocks.loadSessionMeta.mockResolvedValue({
      sessionId: "session-1",
      acpSessionId: "acp-existing",
      agentId: "claude-acp",
      title: "Session",
      turnCount: 1,
      tokenUsage: { used: 0, size: 0 },
      createdAt: "2026-05-08T00:00:00.000Z",
      updatedAt: "2026-05-08T00:00:00.000Z",
    });
    mocks.connection.prompt
      .mockRejectedValueOnce({ code: -32602, message: "Session not found: acp-existing" })
      .mockImplementationOnce(async () => ({ usage: { outputTokens: 4 } }));
    mocks.connection.loadSession.mockImplementationOnce(async () => {
      const handler = mocks.sessionHandlers.get("acp-existing");
      handler?.({
        sessionId: "acp-existing",
        update: {
          type: "text_delta",
          text: "replayed",
        } as unknown as SessionNotification["update"],
      } as SessionNotification);
      handler?.({
        sessionId: "acp-existing",
        update: {
          type: "session_info_update",
          title: "Recovered title",
        } as unknown as SessionNotification["update"],
      } as SessionNotification);
    });

    const session = await createSession({
      recoveryContext: {
        hasPersistedHistory: true,
        loadPersistedHistory: async () => [],
      },
    });
    const seen: SessionEvent[] = [];
    session.on("event", (event) => seen.push(event));
    await session.start("hello");

    expect(seen).not.toContainEqual({ type: "text_delta", text: "replayed" });
    expect(seen).toContainEqual({
      type: "session_info_update",
      title: "Recovered title",
    });
  });

  it("injects two reminders on fresh fallback recovery", async () => {
    const reminderPart: TextUIPart = {
      type: "text",
      text: "<system-reminder>\nbody\n</system-reminder>",
    };
    const persistedMessages: Message[] = [
      {
        id: "assistant-1",
        role: "assistant",
        parts: [{ type: "text", text: "你好" }],
        metadata: { sessionId: "session-1", createdAt: new Date("2026-05-08T00:00:00.000Z") },
      },
      {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "继续" }],
        metadata: { sessionId: "session-1", createdAt: new Date("2026-05-08T00:01:00.000Z") },
      },
    ];

    mocks.loadSessionMeta.mockResolvedValue({
      sessionId: "session-1",
      acpSessionId: "acp-existing",
      agentId: "claude-acp",
      title: "Session",
      turnCount: 1,
      tokenUsage: { used: 0, size: 0 },
      createdAt: "2026-05-08T00:00:00.000Z",
      updatedAt: "2026-05-08T00:00:00.000Z",
    });
    mocks.connection.prompt.mockRejectedValueOnce({
      code: -32602,
      message: "Session not found: acp-existing",
    });
    mocks.connection.resumeSession.mockRejectedValueOnce({
      code: -32002,
      message: "Resource not found",
    });
    mocks.connection.loadSession.mockRejectedValueOnce({
      code: -32002,
      message: "Resource not found",
    });
    mocks.resolveSystemReminder.mockResolvedValue(reminderPart);
    const onReminderInjected = vi.fn().mockResolvedValue(undefined);

    const session = await createSession({
      onReminderInjected,
      recoveryContext: {
        hasPersistedHistory: true,
        loadPersistedHistory: async () => persistedMessages,
      },
    });
    await session.start("hello");

    expect(mocks.connection.newSession).toHaveBeenCalledTimes(1);
    expect(onReminderInjected).toHaveBeenCalledTimes(2);
    expect(mocks.connection.prompt).toHaveBeenLastCalledWith({
      sessionId: "acp-new",
      prompt: [
        reminderPart,
        {
          type: "text",
          text: expect.stringContaining("请根据以下对话历史，继续与用户进行对话"),
        },
        { type: "text", text: "hello" },
      ],
    });
    expect(mocks.sessionHandlers.has("acp-existing")).toBe(false);
  });

  it("preserves available_commands when persisting the next turn", async () => {
    mocks.loadSessionMeta.mockResolvedValue({
      sessionId: "session-1",
      acpSessionId: "acp-existing",
      agentId: "claude-acp",
      title: "Session",
      turnCount: 1,
      tokenUsage: { used: 0, size: 0 },
      available_commands: [{ name: "review", description: "Review code" }],
      createdAt: "2026-05-08T00:00:00.000Z",
      updatedAt: "2026-05-08T00:00:00.000Z",
    });

    const session = await createSession();
    await session.start("hello");

    expect(mocks.upsertSessionMeta).toHaveBeenCalledWith(
      "/tmp/project",
      "session-1",
      expect.any(Function),
      expect.objectContaining({
        acpSessionId: "acp-existing",
        agentId: "claude-acp",
        turnCount: 2,
        available_commands: [{ name: "review", description: "Review code" }],
      })
    );
  });
});
