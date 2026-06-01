import { beforeEach, describe, expect, it, vi } from "vitest";
import { ipcMain } from "electron";
import { ChatChannels, ChatProbeChannels, ChatStreamChannels } from "@shared/types/channels";
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
    readAttachmentDataUrl: vi.fn(),
    removeSessionAttachments: vi.fn(),
    saveAttachment: vi.fn(),
    persistSessionMessage: vi.fn(),
    resolveProjectPath: vi.fn(),
    loadSessionMeta: vi.fn(),
    patchSessionMeta: vi.fn(),
    upsertSessionMeta: vi.fn(),
    setConfigOption: vi.fn(),
    ensureProbe: vi.fn(),
    closeProbe: vi.fn(),
    setProbeConfigOption: vi.fn(),
    takeProbeFor: vi.fn(),
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

vi.mock("@main/services/chat/config-option-service", () => ({
  setConfigOption: mocks.setConfigOption,
}));

vi.mock("@main/services/chat/session-probe-service", () => ({
  ensureProbe: mocks.ensureProbe,
  closeProbe: mocks.closeProbe,
  setProbeConfigOption: mocks.setProbeConfigOption,
}));

vi.mock("@main/services/chat/session-probe-registry", () => ({
  sessionProbeRegistry: {
    takeFor: mocks.takeProbeFor,
  },
}));

vi.mock("@main/services/chat/session-probe-bus", () => ({
  sessionProbeBus: {
    onUpdate: vi.fn(),
  },
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

vi.mock("@main/infra/storage/attachment-store", () => ({
  readAttachmentDataUrl: mocks.readAttachmentDataUrl,
  removeSessionAttachments: mocks.removeSessionAttachments,
  saveAttachment: mocks.saveAttachment,
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
    mocks.ensureProbe.mockResolvedValue({
      agentId: "claude-acp",
      status: "ready",
      acpSessionId: "acp-probe",
      configOptions: [],
    });
    mocks.closeProbe.mockResolvedValue(undefined);
    mocks.setProbeConfigOption.mockResolvedValue({
      agentId: "claude-acp",
      status: "ready",
      acpSessionId: "acp-probe",
      configOptions: [],
    });
    mocks.takeProbeFor.mockReturnValue(null);
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

  it("reads attachment file URIs as data URLs", async () => {
    mocks.readAttachmentDataUrl.mockResolvedValueOnce("data:image/png;base64,AAAA");

    const result = await handler(ChatChannels.readAttachmentDataUrl)(
      {},
      {
        uri: "file:///tmp/%E6%88%AA%E5%9B%BE%201.png",
        mediaType: "image/png",
      }
    );

    expect(result).toEqual({
      ok: true,
      data: {
        dataUrl: "data:image/png;base64,AAAA",
      },
    });
    expect(mocks.readAttachmentDataUrl).toHaveBeenCalledWith(
      "file:///tmp/%E6%88%AA%E5%9B%BE%201.png",
      "image/png"
    );
  });

  it("rejects invalid readAttachmentDataUrl input before reading", async () => {
    const nonFileResult = await handler(ChatChannels.readAttachmentDataUrl)(
      {},
      {
        uri: "https://example.com/x.png",
        mediaType: "image/png",
      }
    );
    const nonImageResult = await handler(ChatChannels.readAttachmentDataUrl)(
      {},
      {
        uri: "file:///tmp/doc.pdf",
        mediaType: "application/pdf",
      }
    );

    expect(nonFileResult).toEqual({
      ok: false,
      error: expect.objectContaining({ code: IpcErrorCodes.VALIDATION_ERROR }),
    });
    expect(nonImageResult).toEqual({
      ok: false,
      error: expect.objectContaining({ code: IpcErrorCodes.VALIDATION_ERROR }),
    });
    expect(mocks.readAttachmentDataUrl).not.toHaveBeenCalled();
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

  it("forwards config_options_update chunk and persists config_options", async () => {
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

    const options = [
      {
        type: "select" as const,
        id: "model",
        name: "Model",
        currentValue: "sonnet",
        options: [{ value: "sonnet", name: "Sonnet" }],
      },
    ];
    mocks.eventHandler!({ type: "config_options_update", options });

    expect(mocks.assemblerApply).not.toHaveBeenCalled();
    expect(sink.sendChunk).toHaveBeenCalledWith({
      kind: "config_options_update",
      options,
    });
    await vi.waitFor(() => {
      expect(mocks.patchSessionMeta).toHaveBeenCalledWith(
        "/tmp/project",
        "session-1",
        expect.objectContaining({ configOptions: options })
      );
    });
  });

  it("rejects setConfigOption input missing configId before calling service", async () => {
    const result = await handler(ChatChannels.setConfigOption)(
      {},
      { projectId: "p1", sessionId: "s1", type: "select", value: "haiku" }
    );

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: IpcErrorCodes.VALIDATION_ERROR }),
    });
    expect(mocks.setConfigOption).not.toHaveBeenCalled();
  });

  it("returns configOptions on successful setConfigOption", async () => {
    const configOptions = [
      {
        type: "select" as const,
        id: "model",
        name: "Model",
        currentValue: "haiku",
        options: [{ value: "haiku", name: "Haiku" }],
      },
    ];
    mocks.setConfigOption.mockResolvedValueOnce({ configOptions });

    const result = await handler(ChatChannels.setConfigOption)(
      {},
      {
        projectId: "p1",
        sessionId: "s1",
        configId: "model",
        type: "select",
        value: "haiku",
      }
    );

    expect(result).toEqual({ ok: true, data: { configOptions } });
    expect(mocks.setConfigOption).toHaveBeenCalledWith({
      projectId: "p1",
      sessionId: "s1",
      configId: "model",
      type: "select",
      value: "haiku",
    });
  });

  it("registers probe ensure/close/setConfigOption handlers", async () => {
    const ensureResult = await handler(ChatProbeChannels.ensure)(
      {},
      { agentId: "claude-acp", projectId: "project-1" }
    );
    const closeResult = await handler(ChatProbeChannels.close)({}, { agentId: "claude-acp" });
    const setResult = await handler(ChatProbeChannels.setConfigOption)(
      {},
      { agentId: "claude-acp", configId: "model", type: "select", value: "sonnet" }
    );

    expect(mocks.resolveProjectPath).toHaveBeenCalledWith("project-1");
    expect(mocks.ensureProbe).toHaveBeenCalledWith("claude-acp", "/tmp/project");
    expect(mocks.closeProbe).toHaveBeenCalledWith("claude-acp");
    expect(mocks.setProbeConfigOption).toHaveBeenCalledWith({
      agentId: "claude-acp",
      configId: "model",
      type: "select",
      value: "sonnet",
    });
    expect(ensureResult).toEqual({
      ok: true,
      data: expect.objectContaining({ acpSessionId: "acp-probe" }),
    });
    expect(closeResult).toEqual({ ok: true, data: undefined });
    expect(setResult).toEqual({
      ok: true,
      data: expect.objectContaining({ acpSessionId: "acp-probe" }),
    });
  });

  it("promotes a matching probe acpSessionId into AcpSession preset options", async () => {
    const configOptions = [
      {
        type: "select" as const,
        id: "model",
        name: "Model",
        currentValue: "sonnet",
        options: [{ value: "sonnet", name: "Sonnet" }],
      },
    ];
    mocks.takeProbeFor.mockReturnValueOnce({
      agentId: "claude-acp",
      status: "ready",
      acpSessionId: "acp-probe",
      configOptions,
      startedAt: Date.now(),
    });

    handler(ChatStreamChannels.streamMessage)(
      { sender: { postMessage: vi.fn() } },
      {
        sessionId: "session-1",
        projectId: "project-1",
        agentId: "claude-acp",
        prompt: [{ type: "text", text: "hello" }],
        acpSessionId: "acp-probe",
      }
    );

    const sink = {
      sendChunk: vi.fn(),
      sendDone: vi.fn(),
      sendError: vi.fn(),
    };
    const control = await mocks.onReady!(sink);

    expect(mocks.takeProbeFor).toHaveBeenCalledWith("claude-acp", "acp-probe");
    expect(mocks.patchSessionMeta).toHaveBeenCalledWith(
      "/tmp/project",
      "session-1",
      expect.objectContaining({
        acpSessionId: "acp-probe",
        agentId: "claude-acp",
        configOptions: configOptions,
      })
    );
    const acpSessionMock = vi.mocked((await import("@main/services/chat/acp-session")).AcpSession);
    expect(acpSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({ presetAcpSessionId: "acp-probe" })
    );
    await (control as { start: () => Promise<void> }).start();
    expect(sink.sendError).not.toHaveBeenCalled();
  });

  it("returns a stream error when acpSessionId does not match registry", async () => {
    handler(ChatStreamChannels.streamMessage)(
      { sender: { postMessage: vi.fn() } },
      {
        sessionId: "session-1",
        projectId: "project-1",
        agentId: "claude-acp",
        prompt: [{ type: "text", text: "hello" }],
        acpSessionId: "acp-probe",
      }
    );

    const sink = {
      sendChunk: vi.fn(),
      sendDone: vi.fn(),
      sendError: vi.fn(),
    };
    await mocks.onReady!(sink);

    expect(sink.sendError).toHaveBeenCalledWith(
      IpcErrorCodes.VALIDATION_ERROR,
      expect.stringContaining("probe acpSessionId")
    );
    expect(mocks.patchSessionMeta).not.toHaveBeenCalledWith(
      "/tmp/project",
      "session-1",
      expect.objectContaining({ acpSessionId: "acp-probe" })
    );
    const acpSessionMock = vi.mocked((await import("@main/services/chat/acp-session")).AcpSession);
    expect(acpSessionMock).not.toHaveBeenCalled();
  });

  it("does not consume probe registry when acpSessionId is omitted", async () => {
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

    expect(mocks.takeProbeFor).not.toHaveBeenCalled();
    const acpSessionMock = vi.mocked((await import("@main/services/chat/acp-session")).AcpSession);
    expect(acpSessionMock).toHaveBeenCalledWith(
      expect.not.objectContaining({ presetAcpSessionId: expect.any(String) })
    );
  });
});
