import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { pathToFileURL } from "url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InitializeResponse, SessionNotification } from "@agentclientprotocol/sdk";
import type { TextUIPart } from "ai";
import type { Message } from "@shared/types/chat";
import { IpcErrorCodes } from "@shared/constants/error-codes";
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
    sessionStore: {
      loadAcpSessionId: vi.fn(),
      persistAcpSessionId: vi.fn(),
    },
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
  normalizeAcpSessionConfigOptions: vi.fn((input: unknown) => (Array.isArray(input) ? input : [])),
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

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("AcpSession", () => {
  let tempRoot: string;

  beforeEach(() => {
    if (tempRoot) {
      rmSync(tempRoot, { recursive: true, force: true });
    }
    tempRoot = mkdtempSync(join(tmpdir(), "fyllocode-acp-session-"));
    vi.clearAllMocks();
    mocks.sessionHandlers.clear();
    mocks.getOrStartProcess.mockResolvedValue({
      connection: mocks.connection,
      sessionHandlers: mocks.sessionHandlers,
      initializeResponse: initializeResponse(),
    });
    mocks.connection.resumeSession.mockResolvedValue({});
    mocks.connection.loadSession.mockResolvedValue({});
    mocks.connection.newSession.mockResolvedValue({ sessionId: "acp-new" });
    mocks.connection.prompt.mockResolvedValue({ usage: { outputTokens: 12 } });
    mocks.sessionStore.loadAcpSessionId.mockResolvedValue(null);
    mocks.sessionStore.persistAcpSessionId.mockResolvedValue(undefined);
    mocks.getBundledMcpServers.mockReturnValue([]);
    mocks.toAcpMcpServerEnv.mockImplementation((env: unknown) => env);
    mocks.resolveSystemReminder.mockResolvedValue(null);
  });

  afterEach(() => {
    rmSync(tempRoot, { recursive: true, force: true });
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
      sessionStore: mocks.sessionStore,
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
    await session.start([{ type: "text", text: "hello" }]);

    expect(mocks.connection.newSession).toHaveBeenCalledTimes(1);
    expect(mocks.sessionStore.persistAcpSessionId).toHaveBeenCalledWith("acp-new");
    expect(onReminderInjected).toHaveBeenCalledWith(reminderPart);
    expect(mocks.connection.prompt).toHaveBeenCalledWith({
      sessionId: "acp-new",
      prompt: [reminderPart, { type: "text", text: "hello" }],
    });
  });

  it("passes fylloSessionId when resolving bundled MCP servers", async () => {
    const session = await createSession();
    await session.start([{ type: "text", text: "hello" }]);

    expect(mocks.getBundledMcpServers).toHaveBeenCalledWith({
      projectPath: "/tmp/project",
      fylloSessionId: "session-1",
    });
  });

  it("records cancellation before acpSessionId resolves and does not prompt after setup", async () => {
    const newSessionDeferred = deferred<{ sessionId: string }>();
    mocks.connection.newSession.mockReturnValueOnce(newSessionDeferred.promise);

    const session = await createSession();
    const startPromise = session.start([{ type: "text", text: "hello" }]);

    await vi.waitFor(() => {
      expect(mocks.connection.newSession).toHaveBeenCalledTimes(1);
    });

    session.cancel();

    expect(mocks.connection.cancel).not.toHaveBeenCalled();

    newSessionDeferred.resolve({ sessionId: "acp-new" });
    await startPromise;
    await flushMicrotasks();

    expect(mocks.connection.prompt).not.toHaveBeenCalled();
    expect(mocks.connection.cancel).toHaveBeenCalledWith({ sessionId: "acp-new" });
  });

  it("uses direct prompt first when persisted acpSessionId exists", async () => {
    mocks.sessionStore.loadAcpSessionId.mockResolvedValue("acp-existing");

    const session = await createSession();
    await session.start([{ type: "text", text: "hello" }]);

    expect(mocks.connection.prompt).toHaveBeenCalledWith({
      sessionId: "acp-existing",
      prompt: [{ type: "text", text: "hello" }],
    });
    expect(mocks.connection.resumeSession).not.toHaveBeenCalled();
    expect(mocks.connection.loadSession).not.toHaveBeenCalled();
    expect(mocks.sessionStore.persistAcpSessionId).toHaveBeenCalledWith("acp-existing");
    expect(mocks.resolveSystemReminder).not.toHaveBeenCalled();
  });

  it("preset branch skips newSession and recovery calls", async () => {
    mocks.sessionStore.loadAcpSessionId.mockResolvedValue("acp-preset");

    const session = await createSession({ presetAcpSessionId: "acp-preset" });
    await session.start([{ type: "text", text: "hello" }]);

    expect(mocks.connection.newSession).not.toHaveBeenCalled();
    expect(mocks.connection.resumeSession).not.toHaveBeenCalled();
    expect(mocks.connection.loadSession).not.toHaveBeenCalled();
    expect(mocks.connection.prompt).toHaveBeenCalledWith({
      sessionId: "acp-preset",
      prompt: [{ type: "text", text: "hello" }],
    });
    expect(mocks.sessionStore.persistAcpSessionId).toHaveBeenCalledWith("acp-preset");
  });

  it("preset branch injects reminder before user parts", async () => {
    const reminderPart: TextUIPart = {
      type: "text",
      text: "<system-reminder>\nbody\n</system-reminder>",
    };
    const onReminderInjected = vi.fn().mockResolvedValue(undefined);
    mocks.resolveSystemReminder.mockResolvedValue(reminderPart);

    const session = await createSession({
      presetAcpSessionId: "acp-preset",
      onReminderInjected,
    });
    await session.start([{ type: "text", text: "hello" }]);

    expect(onReminderInjected).toHaveBeenCalledWith(reminderPart);
    expect(mocks.connection.prompt).toHaveBeenCalledWith({
      sessionId: "acp-preset",
      prompt: [reminderPart, { type: "text", text: "hello" }],
    });
  });

  it("preset branch does not emit config_options_update", async () => {
    const session = await createSession({ presetAcpSessionId: "acp-preset" });
    const events: SessionEvent[] = [];
    session.on("event", (event) => events.push(event));

    await session.start([{ type: "text", text: "hello" }]);

    expect(events.some((event) => event.kind === "config_options_update")).toBe(false);
  });

  it("preset branch prompt failure does not enter recovery", async () => {
    mocks.connection.prompt.mockRejectedValueOnce({
      code: -32603,
      message: "Internal error",
      data: { details: "Session not found" },
    });
    const session = await createSession({ presetAcpSessionId: "acp-preset" });
    const events: SessionEvent[] = [];
    session.on("event", (event) => events.push(event));

    await session.start([{ type: "text", text: "hello" }]);

    expect(mocks.connection.resumeSession).not.toHaveBeenCalled();
    expect(mocks.connection.loadSession).not.toHaveBeenCalled();
    expect(mocks.connection.newSession).not.toHaveBeenCalled();
    expect(events).toContainEqual(
      expect.objectContaining({
        kind: "error",
        code: "ACP_ERROR",
      })
    );
  });

  it("falls back to resumeSession on classified direct prompt missing-session failure", async () => {
    mocks.sessionStore.loadAcpSessionId.mockResolvedValue("acp-existing");
    mocks.connection.prompt
      .mockRejectedValueOnce({
        code: -32603,
        message: "Internal error",
        data: { details: "Session not found" },
      })
      .mockResolvedValueOnce({ usage: { outputTokens: 4 } });

    const session = await createSession();
    await session.start([{ type: "text", text: "hello" }]);

    expect(mocks.connection.resumeSession).toHaveBeenCalledWith({
      sessionId: "acp-existing",
      cwd: "/tmp/project",
      mcpServers: [],
    });
    expect(mocks.connection.loadSession).not.toHaveBeenCalled();
    expect(mocks.sessionStore.persistAcpSessionId).toHaveBeenCalledWith("acp-existing");
    expect(mocks.resolveSystemReminder).not.toHaveBeenCalled();
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
    mocks.sessionStore.loadAcpSessionId.mockResolvedValue("acp-existing");
    mocks.connection.prompt
      .mockRejectedValueOnce({ code: -32602, message: "Session not found: acp-existing" })
      .mockResolvedValueOnce({ usage: { outputTokens: 4 } });

    const session = await createSession({
      recoveryContext: {
        hasPersistedHistory: true,
        loadPersistedHistory: async () => [],
      },
    });
    await session.start([{ type: "text", text: "hello" }]);

    expect(mocks.connection.resumeSession).not.toHaveBeenCalled();
    expect(mocks.connection.loadSession).toHaveBeenCalledWith({
      sessionId: "acp-existing",
      cwd: "/tmp/project",
      mcpServers: [],
    });
  });

  it("does not auto-recover when direct prompt failure happens after an update", async () => {
    mocks.sessionStore.loadAcpSessionId.mockResolvedValue("acp-existing");
    mocks.connection.prompt.mockImplementationOnce(async () => {
      const handler = mocks.sessionHandlers.get("acp-existing");
      handler?.({
        sessionId: "acp-existing",
        update: { kind: "text_delta", text: "partial" } as unknown as SessionNotification["update"],
      } as SessionNotification);
      throw { code: -32603, message: "Internal error", data: { details: "Session not found" } };
    });

    const session = await createSession();
    const seen: SessionEvent[] = [];
    session.on("event", (event) => seen.push(event));
    await session.start([{ type: "text", text: "hello" }]);

    expect(mocks.connection.resumeSession).not.toHaveBeenCalled();
    expect(mocks.connection.loadSession).not.toHaveBeenCalled();
    expect(seen).toContainEqual({ kind: "text_delta", text: "partial" });
    expect(seen).toContainEqual({
      kind: "error",
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
    mocks.sessionStore.loadAcpSessionId.mockResolvedValue("acp-existing");
    mocks.connection.prompt
      .mockRejectedValueOnce({ code: -32602, message: "Session not found: acp-existing" })
      .mockImplementationOnce(async () => ({ usage: { outputTokens: 4 } }));
    mocks.connection.loadSession.mockImplementationOnce(async () => {
      const handler = mocks.sessionHandlers.get("acp-existing");
      handler?.({
        sessionId: "acp-existing",
        update: {
          kind: "text_delta",
          text: "replayed",
        } as unknown as SessionNotification["update"],
      } as SessionNotification);
      handler?.({
        sessionId: "acp-existing",
        update: {
          kind: "session_info_update",
          title: "Recovered title",
        } as unknown as SessionNotification["update"],
      } as SessionNotification);
      return {} as never;
    });

    const session = await createSession({
      recoveryContext: {
        hasPersistedHistory: true,
        loadPersistedHistory: async () => [],
      },
    });
    const seen: SessionEvent[] = [];
    session.on("event", (event) => seen.push(event));
    await session.start([{ type: "text", text: "hello" }]);

    expect(seen).not.toContainEqual({ kind: "text_delta", text: "replayed" });
    expect(mocks.sessionStore.persistAcpSessionId).toHaveBeenCalledWith("acp-existing");
    expect(seen).toContainEqual({
      kind: "session_info_update",
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

    mocks.sessionStore.loadAcpSessionId.mockResolvedValue("acp-existing");
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
    await session.start([{ type: "text", text: "hello" }]);

    expect(mocks.connection.newSession).toHaveBeenCalledTimes(1);
    expect(mocks.sessionStore.persistAcpSessionId).toHaveBeenCalledWith("acp-new");
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

  it("converts ChatPromptPart text, image and resource_link into ACP prompt blocks", async () => {
    const imagePath = join(tempRoot, "截图 file.png");
    writeFileSync(imagePath, "image-binary");
    mocks.getOrStartProcess.mockResolvedValue({
      connection: mocks.connection,
      sessionHandlers: mocks.sessionHandlers,
      initializeResponse: initializeResponse({
        agentCapabilities: {
          loadSession: true,
          sessionCapabilities: { resume: {}, close: {}, list: {} },
          promptCapabilities: { image: true, embeddedContext: true },
        },
      }),
    });

    const session = await createSession();
    await session.start([
      { type: "text", text: "hello" },
      {
        type: "image",
        mediaType: "image/png",
        uri: pathToFileURL(imagePath).toString(),
        filename: "截图 file.png",
      },
      {
        type: "resource_link",
        uri: "file:///tmp/doc.pdf",
        mediaType: "application/pdf",
        filename: "doc.pdf",
      },
    ]);

    expect(mocks.connection.prompt).toHaveBeenCalledWith({
      sessionId: "acp-new",
      prompt: [
        { type: "text", text: "hello" },
        {
          type: "image",
          mimeType: "image/png",
          data: Buffer.from("image-binary").toString("base64"),
        },
        {
          type: "resource_link",
          uri: "file:///tmp/doc.pdf",
          name: "doc.pdf",
          mimeType: "application/pdf",
        },
      ],
    });
  });

  it("emits PROMPT_CAPABILITY_MISMATCH and does not prompt when capabilities reject a part", async () => {
    mocks.getOrStartProcess.mockResolvedValue({
      connection: mocks.connection,
      sessionHandlers: mocks.sessionHandlers,
      initializeResponse: initializeResponse({
        agentCapabilities: {
          loadSession: true,
          sessionCapabilities: { resume: {}, close: {}, list: {} },
          promptCapabilities: { image: false, embeddedContext: true },
        },
      }),
    });

    const session = await createSession();
    const seen: SessionEvent[] = [];
    session.on("event", (event) => seen.push(event));
    await session.start([
      { type: "text", text: "hello" },
      {
        type: "image",
        mediaType: "image/png",
        uri: "file:///tmp/missing.png",
        filename: "missing.png",
      },
    ]);

    expect(mocks.connection.prompt).not.toHaveBeenCalled();
    expect(seen).toContainEqual(
      expect.objectContaining({
        kind: "error",
        code: IpcErrorCodes.PROMPT_CAPABILITY_MISMATCH,
      })
    );
  });

  describe("config_options emit", () => {
    const sampleOptions = [
      {
        type: "select",
        id: "model",
        name: "Model",
        currentValue: "sonnet",
        options: [{ value: "sonnet", name: "Sonnet" }],
      },
    ];

    it("emits config_options_update from newSession response", async () => {
      mocks.connection.newSession.mockResolvedValueOnce({
        sessionId: "acp-new",
        configOptions: sampleOptions,
      });

      const session = await createSession();
      const seen: SessionEvent[] = [];
      session.on("event", (event) => seen.push(event));
      await session.start([{ type: "text", text: "hello" }]);

      expect(seen).toContainEqual({ kind: "config_options_update", options: sampleOptions });
    });

    it("emits empty config_options_update when newSession returns null configOptions", async () => {
      mocks.connection.newSession.mockResolvedValueOnce({
        sessionId: "acp-new",
        configOptions: null,
      });

      const session = await createSession();
      const seen: SessionEvent[] = [];
      session.on("event", (event) => seen.push(event));
      await session.start([{ type: "text", text: "hello" }]);

      expect(seen).toContainEqual({ kind: "config_options_update", options: [] });
    });

    it("emits config_options_update from resumeSession response", async () => {
      mocks.sessionStore.loadAcpSessionId.mockResolvedValue("acp-existing");
      mocks.connection.prompt
        .mockRejectedValueOnce({
          code: -32603,
          message: "Internal error",
          data: { details: "Session not found" },
        })
        .mockResolvedValueOnce({ usage: { outputTokens: 4 } });
      mocks.connection.resumeSession.mockResolvedValueOnce({ configOptions: sampleOptions });

      const session = await createSession();
      const seen: SessionEvent[] = [];
      session.on("event", (event) => seen.push(event));
      await session.start([{ type: "text", text: "hello" }]);

      expect(seen).toContainEqual({ kind: "config_options_update", options: sampleOptions });
    });

    it("emits config_options_update from loadSession response even with suppressReplay", async () => {
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
      mocks.sessionStore.loadAcpSessionId.mockResolvedValue("acp-existing");
      mocks.connection.prompt
        .mockRejectedValueOnce({ code: -32602, message: "Session not found: acp-existing" })
        .mockResolvedValueOnce({ usage: { outputTokens: 4 } });
      mocks.connection.loadSession.mockResolvedValueOnce({ configOptions: sampleOptions });

      const session = await createSession({
        recoveryContext: {
          hasPersistedHistory: true,
          loadPersistedHistory: async () => [],
        },
      });
      const seen: SessionEvent[] = [];
      session.on("event", (event) => seen.push(event));
      await session.start([{ type: "text", text: "hello" }]);

      expect(seen).toContainEqual({ kind: "config_options_update", options: sampleOptions });
    });

    it("does not emit config_options_update from direct prompt success", async () => {
      mocks.sessionStore.loadAcpSessionId.mockResolvedValue("acp-existing");

      const session = await createSession();
      const seen: SessionEvent[] = [];
      session.on("event", (event) => seen.push(event));
      await session.start([{ type: "text", text: "hello" }]);

      expect(seen).not.toContainEqual(expect.objectContaining({ kind: "config_options_update" }));
    });
  });
});
