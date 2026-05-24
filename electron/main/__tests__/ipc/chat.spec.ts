import { beforeEach, describe, expect, it, vi } from "vitest";
import { ipcMain } from "electron";
import { ChatChannels, ChatStreamChannels } from "@shared/types/channels";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import type { SessionEvent } from "@main/domain/chat/session-events";
import type { AcpSessionOpts } from "@main/services/chat/acp-session";
import { ChatAcpSessionStore } from "@main/infra/storage/chat-acp-session-store";

const mocks = vi.hoisted(() => {
  let eventHandler: ((ev: SessionEvent) => void) | null = null;
  let onReady:
    | ((sink: {
        sendChunk: ReturnType<typeof vi.fn>;
        sendDone: ReturnType<typeof vi.fn>;
        sendError: ReturnType<typeof vi.fn>;
      }) => unknown)
    | null = null;

  return {
    appendMessage: vi.fn(),
    prependReminderToLastUserMessage: vi.fn(),
    persistSessionMessage: vi.fn(),
    resolveProjectPath: vi.fn(),
    loadSessionMeta: vi.fn(),
    patchSessionMeta: vi.fn(),
    upsertSessionMeta: vi.fn(),
    register: vi.fn(),
    unregister: vi.fn(),
    cancel: vi.fn(),
    assemblerApply: vi.fn(),
    assemblerFlush: vi.fn(),
    get eventHandler() {
      return eventHandler;
    },
    set eventHandler(next) {
      eventHandler = next;
    },
    get onReady() {
      return onReady;
    },
    set onReady(next) {
      onReady = next;
    },
  };
});

vi.mock("@main/services/chat/chat-service", () => ({
  createSession: vi.fn(),
  listSessions: vi.fn(),
  loadSessionMessages: vi.fn(),
  persistSessionMessage: mocks.persistSessionMessage,
  removeSession: vi.fn(),
  resolveProjectPath: mocks.resolveProjectPath,
  updateSession: vi.fn(),
}));

vi.mock("@main/infra/storage/session-store", () => ({
  appendMessage: mocks.appendMessage,
  loadSessionMeta: mocks.loadSessionMeta,
  patchSessionMeta: mocks.patchSessionMeta,
  upsertSessionMeta: mocks.upsertSessionMeta,
  sessionMessagesPath: vi.fn(
    (projectPath: string, sessionId: string) => `${projectPath}/${sessionId}.messages.jsonl`
  ),
}));

vi.mock("@main/infra/storage/message-reminder-store", () => ({
  prependReminderToLastUserMessage: mocks.prependReminderToLastUserMessage,
}));

vi.mock("@main/services/chat/session-registry", () => ({
  sessionRegistry: {
    register: mocks.register,
    unregister: mocks.unregister,
    cancel: mocks.cancel,
  },
}));

vi.mock("@main/services/chat/acp-session", () => ({
  AcpSession: vi.fn(function () {
    return {
      on: vi.fn((_event: "event", handler: (ev: SessionEvent) => void) => {
        mocks.eventHandler = handler;
      }),
      start: vi.fn(),
      cancel: vi.fn(),
    };
  }),
}));

vi.mock("@main/services/chat/message-assembler", () => ({
  MessageAssembler: vi.fn(function () {
    return {
      apply: mocks.assemblerApply,
      flush: mocks.assemblerFlush,
    };
  }),
}));

vi.mock("@main/ipc/_kit/stream-channel", () => ({
  makeStreamChannel: vi.fn((options) => {
    mocks.onReady = options.onReady;
    return { ok: true, data: null };
  }),
}));

describe("registerChatHandlers", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.eventHandler = null;
    mocks.onReady = null;
    mocks.resolveProjectPath.mockResolvedValue("/tmp/project");
    mocks.loadSessionMeta.mockResolvedValue({
      sessionId: "session-1",
      agentId: "claude-acp",
      title: "Session",
      turnCount: 0,
      tokenUsage: { used: 0, size: 0 },
      createdAt: "2026-05-09T00:00:00.000Z",
      updatedAt: "2026-05-09T00:00:00.000Z",
    });
    mocks.patchSessionMeta.mockImplementation(async (_projectPath, _sessionId, update) => {
      const current =
        mocks.loadSessionMeta.mock.results.at(-1)?.value instanceof Promise
          ? await mocks.loadSessionMeta.mock.results.at(-1)?.value
          : await mocks.loadSessionMeta();
      if (!current) return null;
      return typeof update === "function"
        ? { ...current, ...update(current) }
        : { ...current, ...update };
    });
    mocks.upsertSessionMeta.mockImplementation(async (_projectPath, _sessionId, create, update) => {
      const current = await mocks.loadSessionMeta();
      const base = current ?? create();
      const next = typeof update === "function" ? update(base) : update;
      return { ...base, ...next };
    });
    mocks.assemblerFlush.mockReturnValue(null);
    const { registerChatHandlers } = await import("@main/ipc/chat");
    registerChatHandlers();
  });

  function handler(channel: string): (event: unknown, input: unknown) => unknown {
    const call = vi
      .mocked(ipcMain.handle)
      .mock.calls.find(([registeredChannel]) => registeredChannel === channel);
    expect(call).toBeTruthy();
    return call![1] as (event: unknown, input: unknown) => unknown;
  }

  it("rejects assistant messages in persistMessage", async () => {
    const result = await handler(ChatChannels.persistMessage)(
      {},
      {
        sessionId: "session-1",
        projectId: "project-1",
        message: {
          id: "message-1",
          role: "assistant",
          parts: [],
        },
      }
    );

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: IpcErrorCodes.VALIDATION_ERROR }),
    });
    expect(mocks.persistSessionMessage).not.toHaveBeenCalled();
  });

  it("persists assembled assistant message before sending done", async () => {
    mocks.assemblerFlush.mockReturnValueOnce({
      id: "assistant-message-1",
      role: "assistant",
      parts: [{ type: "text", text: "assistant" }],
      metadata: {
        sessionId: "session-1",
        createdAt: new Date("2026-05-09T00:00:00.000Z"),
      },
    });

    handler(ChatStreamChannels.streamMessage)(
      { sender: { postMessage: vi.fn() } },
      {
        sessionId: "session-1",
        projectId: "project-1",
        agentId: "claude-acp",
        prompt: [{ type: "text", text: "hello" }],
      }
    );

    const sink = {
      sendChunk: vi.fn(),
      sendDone: vi.fn(),
      sendError: vi.fn(),
    };
    await mocks.onReady!(sink);

    mocks.eventHandler!({ type: "text_delta", text: "assistant" });
    mocks.eventHandler!({ type: "done", totalTokens: 4 });

    await vi.waitFor(() => {
      expect(mocks.appendMessage).toHaveBeenCalledTimes(1);
      expect(sink.sendDone).toHaveBeenCalledWith(4);
    });
    expect(mocks.appendMessage).toHaveBeenCalledWith(
      "/tmp/project",
      "session-1",
      expect.objectContaining({ id: "assistant-message-1", role: "assistant" })
    );
  });

  it("forwards usage_update chunks and persists token usage", async () => {
    handler(ChatStreamChannels.streamMessage)(
      { sender: { postMessage: vi.fn() } },
      {
        sessionId: "session-1",
        projectId: "project-1",
        agentId: "claude-acp",
        prompt: [{ type: "text", text: "hello" }],
      }
    );

    const sink = {
      sendChunk: vi.fn(),
      sendDone: vi.fn(),
      sendError: vi.fn(),
    };
    await mocks.onReady!(sink);

    mocks.eventHandler!({
      type: "usage_update",
      used: 29017,
      size: 1000000,
      cost: { amount: 0.145305, currency: "USD" },
    });

    expect(sink.sendChunk).toHaveBeenCalledWith({
      kind: "usage_update",
      used: 29017,
      size: 1000000,
      cost: { amount: 0.145305, currency: "USD" },
    });
    await vi.waitFor(() => {
      expect(mocks.patchSessionMeta).toHaveBeenCalledWith(
        "/tmp/project",
        "session-1",
        expect.objectContaining({
          tokenUsage: {
            used: 29017,
            size: 1000000,
            cost: { amount: 0.145305, currency: "USD" },
          },
        })
      );
    });
    expect(mocks.appendMessage).not.toHaveBeenCalled();
  });

  it("increments persisted token usage on done without dropping available commands", async () => {
    mocks.loadSessionMeta.mockResolvedValue({
      sessionId: "session-1",
      agentId: "claude-acp",
      title: "Session",
      turnCount: 0,
      tokenUsage: {
        used: 29017,
        size: 1000000,
        cost: { amount: 0.145305, currency: "USD" },
      },
      available_commands: [{ name: "review", description: "Review code" }],
      createdAt: "2026-05-09T00:00:00.000Z",
      updatedAt: "2026-05-09T00:00:00.000Z",
    });

    handler(ChatStreamChannels.streamMessage)(
      { sender: { postMessage: vi.fn() } },
      {
        sessionId: "session-1",
        projectId: "project-1",
        agentId: "claude-acp",
        prompt: [{ type: "text", text: "hello" }],
      }
    );

    const sink = {
      sendChunk: vi.fn(),
      sendDone: vi.fn(),
      sendError: vi.fn(),
    };
    await mocks.onReady!(sink);

    mocks.eventHandler!({ type: "done", totalTokens: 4 });

    await vi.waitFor(() => {
      expect(mocks.patchSessionMeta).toHaveBeenCalledWith(
        "/tmp/project",
        "session-1",
        expect.any(Function)
      );
      expect(sink.sendDone).toHaveBeenCalledWith(4);
    });
  });

  it("rejects streamMessage when both input agentId and persisted agentId are missing", async () => {
    mocks.loadSessionMeta.mockResolvedValue({
      sessionId: "session-1",
      agentId: "",
      title: "Session",
      turnCount: 0,
      tokenUsage: { used: 0, size: 0 },
      createdAt: "2026-05-12T00:00:00.000Z",
      updatedAt: "2026-05-12T00:00:00.000Z",
    });

    handler(ChatStreamChannels.streamMessage)(
      { sender: { postMessage: vi.fn() } },
      {
        sessionId: "session-1",
        projectId: "project-1",
        agentId: "",
        prompt: [{ type: "text", text: "hello" }],
      }
    );

    const sink = {
      sendChunk: vi.fn(),
      sendDone: vi.fn(),
      sendError: vi.fn(),
    };
    await expect(mocks.onReady!(sink)).rejects.toMatchObject({
      code: IpcErrorCodes.VALIDATION_ERROR,
    });

    const acpSessionMock = vi.mocked((await import("@main/services/chat/acp-session")).AcpSession);
    expect(acpSessionMock).not.toHaveBeenCalled();
  });

  it("applies reasoning_delta to the assembler and forwards the chunk", async () => {
    handler(ChatStreamChannels.streamMessage)(
      { sender: { postMessage: vi.fn() } },
      {
        sessionId: "session-1",
        projectId: "project-1",
        agentId: "claude-acp",
        prompt: [{ type: "text", text: "hello" }],
      }
    );

    const sink = {
      sendChunk: vi.fn(),
      sendDone: vi.fn(),
      sendError: vi.fn(),
    };
    await mocks.onReady!(sink);

    const event: SessionEvent = { type: "reasoning_delta", text: "thinking" };
    mocks.eventHandler!(event);

    expect(mocks.assemblerApply).toHaveBeenCalledWith(event);
    expect(sink.sendChunk).toHaveBeenCalledWith({
      kind: "reasoning_delta",
      text: "thinking",
    });
  });

  it("passes chat owner and reminder hook without sending sink chunks", async () => {
    const reminderPart = {
      type: "text",
      text: "<system-reminder>\nbody\n</system-reminder>",
    } as const;
    handler(ChatStreamChannels.streamMessage)(
      { sender: { postMessage: vi.fn() } },
      {
        sessionId: "session-1",
        projectId: "project-1",
        agentId: "claude-acp",
        prompt: [{ type: "text", text: "hello" }],
      }
    );

    const sink = {
      sendChunk: vi.fn(),
      sendDone: vi.fn(),
      sendError: vi.fn(),
    };
    await mocks.onReady!(sink);

    const acpSessionMock = vi.mocked((await import("@main/services/chat/acp-session")).AcpSession);
    const opts = acpSessionMock.mock.calls[0]?.[0] as AcpSessionOpts | undefined;
    expect(opts).toBeDefined();
    if (!opts?.onReminderInjected) {
      throw new Error("Expected onReminderInjected hook");
    }

    expect(opts).toEqual(
      expect.objectContaining({
        owner: "chat",
        projectPath: "/tmp/project",
      })
    );
    expect(opts.sessionStore).toBeInstanceOf(ChatAcpSessionStore);

    await opts.onReminderInjected(reminderPart);

    expect(mocks.prependReminderToLastUserMessage).toHaveBeenCalledWith(
      "/tmp/project/session-1.messages.jsonl",
      reminderPart
    );
    expect(sink.sendChunk).not.toHaveBeenCalledWith(
      expect.objectContaining({ kind: "user_message" })
    );
  });

  it("forwards available_commands_update without assembler and persists session meta", async () => {
    handler(ChatStreamChannels.streamMessage)(
      { sender: { postMessage: vi.fn() } },
      {
        sessionId: "session-1",
        projectId: "project-1",
        agentId: "claude-acp",
        prompt: [{ type: "text", text: "hello" }],
      }
    );

    const sink = {
      sendChunk: vi.fn(),
      sendDone: vi.fn(),
      sendError: vi.fn(),
    };
    await mocks.onReady!(sink);

    const event: SessionEvent = {
      type: "available_commands_update",
      commands: [{ name: "review", description: "Review code" }],
    };
    mocks.eventHandler!(event);

    expect(mocks.assemblerApply).not.toHaveBeenCalled();
    expect(sink.sendChunk).toHaveBeenCalledWith({
      kind: "available_commands_update",
      commands: [{ name: "review", description: "Review code" }],
    });
    await vi.waitFor(() => {
      expect(mocks.patchSessionMeta).toHaveBeenCalledWith(
        "/tmp/project",
        "session-1",
        expect.objectContaining({
          available_commands: [{ name: "review", description: "Review code" }],
        })
      );
    });
  });

  it("persists an empty available_commands_update array", async () => {
    handler(ChatStreamChannels.streamMessage)(
      { sender: { postMessage: vi.fn() } },
      {
        sessionId: "session-1",
        projectId: "project-1",
        agentId: "claude-acp",
        prompt: [{ type: "text", text: "hello" }],
      }
    );

    const sink = {
      sendChunk: vi.fn(),
      sendDone: vi.fn(),
      sendError: vi.fn(),
    };
    await mocks.onReady!(sink);

    mocks.eventHandler!({
      type: "available_commands_update",
      commands: [],
    });

    expect(sink.sendChunk).toHaveBeenCalledWith({
      kind: "available_commands_update",
      commands: [],
    });
    await vi.waitFor(() => {
      expect(mocks.patchSessionMeta).toHaveBeenCalledWith(
        "/tmp/project",
        "session-1",
        expect.objectContaining({
          available_commands: [],
        })
      );
    });
  });
});
