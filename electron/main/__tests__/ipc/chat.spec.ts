import { beforeEach, describe, expect, it, vi } from "vitest";
import { ipcMain } from "electron";
import { ChatChannels, ChatStreamChannels } from "@shared/types/channels";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import type { SessionEvent } from "@main/domain/chat/session-events";

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
    persistSessionMessage: vi.fn(),
    resolveProjectPath: vi.fn(),
    loadSessionMeta: vi.fn(),
    saveSessionMeta: vi.fn(),
    register: vi.fn(),
    unregister: vi.fn(),
    cancel: vi.fn(),
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
  saveSessionMeta: mocks.saveSessionMeta,
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
    mocks.loadSessionMeta.mockResolvedValue({ agentId: "claude-acp" });
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
    handler(ChatStreamChannels.streamMessage)(
      { sender: { postMessage: vi.fn() } },
      {
        sessionId: "session-1",
        projectId: "project-1",
        agentId: "claude-acp",
        prompt: "hello",
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
      expect.objectContaining({
        role: "assistant",
        parts: [{ type: "text", text: "assistant" }],
      })
    );
  });
});
