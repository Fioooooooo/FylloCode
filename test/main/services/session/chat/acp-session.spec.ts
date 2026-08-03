import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { pathToFileURL } from "url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InitializeResponse, SessionNotification } from "@agentclientprotocol/sdk";
import type { TextUIPart } from "ai";
import type { Message } from "@shared/types/chat";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import type { SessionEvent } from "@main/domain/session/chat/session-events";

const mocks = vi.hoisted(() => {
  const sessionHandlers = new Map<string, (notification: SessionNotification) => void>();
  const activeSessionIds = new Set<string>();
  const mcpActivationBySessionId = new Map<string, string | null>();
  const connection = {
    resumeSession: vi.fn(),
    loadSession: vi.fn(),
    newSession: vi.fn(),
    prompt: vi.fn(),
    cancel: vi.fn(),
    setSessionConfigOption: vi.fn(),
  };

  return {
    connection,
    sessionHandlers,
    activeSessionIds,
    mcpActivationBySessionId,
    getOrStartProcess: vi.fn(),
    hasActiveAcpSession: vi.fn(),
    hasActiveMcpActivation: vi.fn(),
    sessionStore: {
      loadRecoveryState: vi.fn(),
      persistAcpSessionId: vi.fn(),
    },
    createBundledMcpActivation: vi.fn(),
    revokeBundledMcpActivation: vi.fn(),
    toAcpMcpServer: vi.fn(),
    resolveSystemReminder: vi.fn(),
    assertSessionWorkspaceSnapshotCurrent: vi.fn(),
    createSessionMcpWorkspaceDescriptor: vi.fn(),
    assertAgentWorkspaceCompatibility: vi.fn(),
    readAttachmentDataUrl: vi.fn(),
    resolveSessionMemberResource: vi.fn(),
    forgetActiveAcpSession: vi.fn(
      (
        entry: {
          activeSessionIds: Set<string>;
          mcpActivationBySessionId?: Map<string, string | null>;
        },
        sessionId: string
      ) => {
        entry.activeSessionIds.delete(sessionId);
        entry.mcpActivationBySessionId?.delete(sessionId);
      }
    ),
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  };
});

vi.mock("@main/infra/process/acp-process-pool", () => ({
  getOrStartProcess: mocks.getOrStartProcess,
  hasActiveAcpSession: mocks.hasActiveAcpSession,
  hasActiveMcpActivation: mocks.hasActiveMcpActivation,
  markAcpSessionActive: vi.fn(
    (
      entry: {
        activeSessionIds: Set<string>;
        mcpActivationBySessionId?: Map<string, string | null>;
      },
      sessionId: string,
      activationId: string | null = null
    ) => {
      entry.activeSessionIds.add(sessionId);
      entry.mcpActivationBySessionId?.set(sessionId, activationId);
    }
  ),
  forgetActiveAcpSession: mocks.forgetActiveAcpSession,
}));

vi.mock("@main/infra/mcp/bundled-mcp-servers", () => ({
  createBundledMcpActivation: mocks.createBundledMcpActivation,
  revokeBundledMcpActivation: mocks.revokeBundledMcpActivation,
  toAcpMcpServer: mocks.toAcpMcpServer,
}));

vi.mock("@main/services/session/chat/mcp-workspace-descriptor", () => ({
  createSessionMcpWorkspaceDescriptor: mocks.createSessionMcpWorkspaceDescriptor,
}));

vi.mock("@main/services/session/chat/system-reminder", () => ({
  resolveSystemReminder: mocks.resolveSystemReminder,
}));

vi.mock("@main/services/session/chat/session-workspace-service", () => ({
  assertSessionWorkspaceSnapshotCurrent: mocks.assertSessionWorkspaceSnapshotCurrent,
}));

vi.mock("@main/services/session/chat/agent-workspace-compatibility", () => ({
  assertAgentWorkspaceCompatibility: mocks.assertAgentWorkspaceCompatibility,
}));

vi.mock("@main/infra/storage/attachment-store", () => ({
  readAttachmentDataUrl: mocks.readAttachmentDataUrl,
}));

vi.mock("@main/services/session/chat/member-resource-resolver", () => ({
  resolveSessionMemberResource: mocks.resolveSessionMemberResource,
}));

vi.mock("@main/domain/session/chat/system-reminder-wrap", () => ({
  wrapAsSystemReminder: (body: string) => `<system-reminder>\n${body}\n</system-reminder>`,
}));

vi.mock("@main/infra/logger", () => ({
  default: mocks.logger,
}));

vi.mock("@main/services/session/chat/acp-mapper", () => ({
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
    mocks.activeSessionIds.clear();
    mocks.mcpActivationBySessionId.clear();
    mocks.getOrStartProcess.mockResolvedValue({
      connection: mocks.connection,
      sessionHandlers: mocks.sessionHandlers,
      activeSessionIds: mocks.activeSessionIds,
      mcpActivationBySessionId: mocks.mcpActivationBySessionId,
      initializeResponse: initializeResponse(),
    });
    mocks.hasActiveAcpSession.mockReturnValue(true);
    mocks.hasActiveMcpActivation.mockReturnValue(true);
    mocks.connection.resumeSession.mockResolvedValue({});
    mocks.connection.loadSession.mockResolvedValue({});
    mocks.connection.newSession.mockResolvedValue({ sessionId: "acp-new" });
    mocks.connection.prompt.mockResolvedValue({ usage: { outputTokens: 12 } });
    mocks.connection.cancel.mockResolvedValue(undefined);
    mocks.sessionStore.loadRecoveryState.mockResolvedValue({
      acpSessionId: null,
      configOptions: [],
    });
    mocks.sessionStore.persistAcpSessionId.mockResolvedValue(undefined);
    mocks.createBundledMcpActivation.mockResolvedValue({ servers: [], activationId: null });
    mocks.toAcpMcpServer.mockImplementation((spec: unknown) => spec);
    mocks.resolveSystemReminder.mockResolvedValue(null);
    mocks.assertSessionWorkspaceSnapshotCurrent.mockImplementation(async (snapshot) => snapshot);
    mocks.createSessionMcpWorkspaceDescriptor.mockImplementation(async (snapshot, sessionId) => {
      const current = await mocks.assertSessionWorkspaceSnapshotCurrent(snapshot);
      return {
        version: 2,
        workspaceId: current.workspaceId,
        workspaceKind: current.workspaceKind,
        primaryFolderId: current.primaryFolderId,
        folders: current.folders,
        workspaceDataDir: "/tmp/workspace-data",
        sessionId,
      };
    });
    mocks.assertAgentWorkspaceCompatibility.mockResolvedValue(undefined);
    mocks.readAttachmentDataUrl.mockResolvedValue("data:image/png;base64,SU1BR0U=");
    mocks.resolveSessionMemberResource.mockResolvedValue({
      folderId: "folder-1",
      worktreePath: "/tmp/project",
      repositoryRelativePath: "docs/guide.md",
      canonicalPath: "/tmp/project/docs/guide.md",
      uri: "file:///tmp/project/docs/guide.md",
    });
  });

  afterEach(() => {
    rmSync(tempRoot, { recursive: true, force: true });
  });

  async function createSession(
    overrides: Partial<import("@main/services/session/chat/acp-session").AcpSessionOpts> = {}
  ): Promise<import("@main/services/session/chat/acp-session").AcpSession> {
    const { AcpSession } = await import("@main/services/session/chat/acp-session");
    return new AcpSession({
      fylloSessionId: "session-1",
      agentId: "claude-acp",
      workspaceId: "workspace-1",
      projectPath: "/tmp/project",
      cwd: "/tmp/project",
      additionalDirectories: [],
      workspaceSnapshot: {
        workspaceId: "workspace-1",
        workspaceKind: "folder",
        primaryFolderId: "folder-1",
        folders: [{ folderId: "folder-1", folderName: "Project", folderPath: "/tmp/project" }],
        cwd: "/tmp/project",
        additionalDirectories: [],
      },
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

  it("fails stale validation before acquiring an Agent process", async () => {
    mocks.assertSessionWorkspaceSnapshotCurrent.mockRejectedValueOnce(
      Object.assign(new Error("removed"), { code: IpcErrorCodes.SESSION_FOLDER_REMOVED })
    );
    const session = await createSession();

    await expect(session.start([{ type: "text", text: "hello" }])).rejects.toMatchObject({
      code: IpcErrorCodes.SESSION_FOLDER_REMOVED,
    });
    expect(mocks.getOrStartProcess).not.toHaveBeenCalled();
  });

  it("rejects an oversized Workspace reminder before capability or Agent activation", async () => {
    const oversizedSnapshot = {
      workspaceId: "workspace-1",
      workspaceKind: "folder" as const,
      primaryFolderId: "folder-1",
      folders: [
        {
          folderId: "folder-1",
          folderName: "Project",
          folderPath: `/tmp/${"路径".repeat(40_000)}`,
        },
      ],
      cwd: "/tmp/project",
      additionalDirectories: [],
    };
    const session = await createSession({ workspaceSnapshot: oversizedSnapshot });

    await expect(session.start([{ type: "text", text: "hello" }])).rejects.toMatchObject({
      code: IpcErrorCodes.WORKSPACE_REMINDER_TOO_LARGE,
    });
    expect(mocks.assertAgentWorkspaceCompatibility).not.toHaveBeenCalled();
    expect(mocks.getOrStartProcess).not.toHaveBeenCalled();
    expect(mocks.connection.prompt).not.toHaveBeenCalled();
  });

  it("derives the descriptor first and creates MCP specs only for lifecycle activation", async () => {
    const session = await createSession();
    await session.start([{ type: "text", text: "hello" }]);

    expect(mocks.createSessionMcpWorkspaceDescriptor).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "workspace-1" }),
      "session-1"
    );
    expect(mocks.createBundledMcpActivation).toHaveBeenCalledWith({
      agentId: "claude-acp",
      descriptor: expect.objectContaining({
        workspaceId: "workspace-1",
        sessionId: "session-1",
      }),
      supportsHttp: false,
    });
  });

  it("keeps apply activation owner-only with an explicit MCP descriptor", async () => {
    const mcpWorkspaceDescriptor = {
      version: 2 as const,
      workspaceId: "workspace-1",
      workspaceKind: "folder" as const,
      primaryFolderId: "folder-1",
      folders: [
        {
          folderId: "folder-1",
          folderName: "Project",
          folderPath: "/tmp/proposal-worktree",
        },
      ],
      workspaceDataDir: "/tmp/workspace-data",
      sessionId: "session-1",
    };
    const session = await createSession({
      owner: "apply",
      projectPath: "/tmp/proposal-worktree",
      cwd: "/tmp/proposal-worktree",
      additionalDirectories: [],
      workspaceSnapshot: undefined,
      mcpWorkspaceDescriptor,
    });
    await session.start([{ type: "text", text: "apply" }]);

    expect(mocks.connection.newSession).toHaveBeenCalledWith({
      cwd: "/tmp/proposal-worktree",
      additionalDirectories: [],
      mcpServers: [],
    });
    expect(mocks.createBundledMcpActivation).toHaveBeenCalledWith({
      agentId: "claude-acp",
      descriptor: mcpWorkspaceDescriptor,
      supportsHttp: false,
    });
    expect(mocks.assertSessionWorkspaceSnapshotCurrent).not.toHaveBeenCalled();
  });

  it("waits for bundled MCP readiness before calling newSession", async () => {
    const bundledServers = deferred<{ servers: []; activationId: null }>();
    mocks.createBundledMcpActivation.mockReturnValueOnce(bundledServers.promise);

    const session = await createSession();
    const start = session.start([{ type: "text", text: "hello" }]);
    await vi.waitFor(() => expect(mocks.createBundledMcpActivation).toHaveBeenCalledOnce());
    expect(mocks.connection.newSession).not.toHaveBeenCalled();

    bundledServers.resolve({ servers: [], activationId: null });
    await start;
    expect(mocks.connection.newSession).toHaveBeenCalledOnce();
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
    expect(mocks.revokeBundledMcpActivation).toHaveBeenCalledWith(null);
  });

  it("cancels only the current prompt and reuses its active MCP activation next turn", async () => {
    const firstPrompt = deferred<{ usage: { outputTokens: number } }>();
    mocks.sessionStore.loadRecoveryState.mockResolvedValue({
      acpSessionId: "acp-existing",
      configOptions: [],
    });
    mocks.activeSessionIds.add("acp-existing");
    mocks.mcpActivationBySessionId.set("acp-existing", "activation-existing");
    mocks.connection.prompt
      .mockReturnValueOnce(firstPrompt.promise)
      .mockResolvedValueOnce({ usage: { outputTokens: 8 } });

    const firstTurn = await createSession();
    const firstStart = firstTurn.start([{ type: "text", text: "long task" }]);
    await vi.waitFor(() => expect(mocks.connection.prompt).toHaveBeenCalledOnce());

    firstTurn.cancel();

    expect(mocks.connection.cancel).toHaveBeenCalledOnce();
    expect(mocks.connection.cancel).toHaveBeenCalledWith({ sessionId: "acp-existing" });
    expect(mocks.forgetActiveAcpSession).not.toHaveBeenCalled();
    expect(mocks.activeSessionIds.has("acp-existing")).toBe(true);
    expect(mocks.mcpActivationBySessionId.get("acp-existing")).toBe("activation-existing");

    firstPrompt.resolve({ usage: { outputTokens: 4 } });
    await firstStart;

    const secondTurn = await createSession();
    await secondTurn.start([{ type: "text", text: "continue" }]);

    expect(mocks.connection.resumeSession).not.toHaveBeenCalled();
    expect(mocks.connection.loadSession).not.toHaveBeenCalled();
    expect(mocks.createBundledMcpActivation).not.toHaveBeenCalled();
    expect(mocks.connection.prompt).toHaveBeenLastCalledWith({
      sessionId: "acp-existing",
      prompt: [{ type: "text", text: "continue" }],
    });
  });

  it("uses direct prompt first when persisted acpSessionId exists", async () => {
    mocks.sessionStore.loadRecoveryState.mockResolvedValue({
      acpSessionId: "acp-existing",
      configOptions: [],
    });

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
    expect(mocks.createBundledMcpActivation).not.toHaveBeenCalled();
  });

  it("treats an expired MCP lease as cold and reactivates before prompting", async () => {
    mocks.hasActiveMcpActivation.mockReturnValue(false);
    mocks.sessionStore.loadRecoveryState.mockResolvedValue({
      acpSessionId: "acp-existing",
      configOptions: [],
    });

    const session = await createSession();
    await session.start([{ type: "text", text: "continue" }]);

    expect(mocks.connection.resumeSession).toHaveBeenCalledOnce();
    expect(mocks.createBundledMcpActivation).toHaveBeenCalledOnce();
    expect(mocks.connection.prompt).toHaveBeenCalledWith({
      sessionId: "acp-existing",
      prompt: [{ type: "text", text: "continue" }],
    });
  });

  it("preset branch skips newSession and recovery calls", async () => {
    mocks.sessionStore.loadRecoveryState.mockResolvedValue({
      acpSessionId: "acp-preset",
      configOptions: [],
    });

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
    mocks.sessionStore.loadRecoveryState.mockResolvedValue({
      acpSessionId: "acp-existing",
      configOptions: [],
    });
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
      additionalDirectories: [],
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
      activeSessionIds: mocks.activeSessionIds,
      initializeResponse: initializeResponse({
        agentCapabilities: {
          loadSession: true,
          sessionCapabilities: { close: {}, list: {} },
        },
      }),
    });
    mocks.sessionStore.loadRecoveryState.mockResolvedValue({
      acpSessionId: "acp-existing",
      configOptions: [],
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
    await session.start([{ type: "text", text: "hello" }]);

    expect(mocks.connection.resumeSession).not.toHaveBeenCalled();
    expect(mocks.connection.loadSession).toHaveBeenCalledWith({
      sessionId: "acp-existing",
      cwd: "/tmp/project",
      additionalDirectories: [],
      mcpServers: [],
    });
  });

  it("does not auto-recover when direct prompt failure happens after an update", async () => {
    mocks.sessionStore.loadRecoveryState.mockResolvedValue({
      acpSessionId: "acp-existing",
      configOptions: [],
    });
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
      activeSessionIds: mocks.activeSessionIds,
      initializeResponse: initializeResponse({
        agentCapabilities: {
          loadSession: true,
          sessionCapabilities: { close: {}, list: {} },
        },
      }),
    });
    mocks.sessionStore.loadRecoveryState.mockResolvedValue({
      acpSessionId: "acp-existing",
      configOptions: [],
    });
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

    mocks.sessionStore.loadRecoveryState.mockResolvedValue({
      acpSessionId: "acp-existing",
      configOptions: [],
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

  it("uses the upgraded connection with the persisted session recovery order", async () => {
    const callOrder: string[] = [];
    const upgradedConnection = {
      resumeSession: vi.fn(async () => {
        callOrder.push("resume");
        throw { code: -32002, message: "Resource not found" };
      }),
      loadSession: vi.fn(async () => {
        callOrder.push("load");
        throw { code: -32002, message: "Resource not found" };
      }),
      newSession: vi.fn(async () => {
        callOrder.push("new");
        return { sessionId: "acp-after-upgrade" };
      }),
      prompt: vi
        .fn()
        .mockRejectedValueOnce({ code: -32602, message: "Session not found: acp-existing" })
        .mockResolvedValueOnce({ usage: { outputTokens: 4 } }),
      cancel: vi.fn(),
    };
    mocks.getOrStartProcess.mockResolvedValue({
      connection: upgradedConnection,
      sessionHandlers: mocks.sessionHandlers,
      activeSessionIds: mocks.activeSessionIds,
      initializeResponse: initializeResponse(),
    });
    mocks.sessionStore.loadRecoveryState.mockResolvedValue({
      acpSessionId: "acp-existing",
      configOptions: [],
    });

    const session = await createSession({
      additionalDirectories: ["/tmp/secondary"],
      recoveryContext: {
        hasPersistedHistory: true,
        loadPersistedHistory: async () => [
          {
            id: "assistant-before-upgrade",
            role: "assistant",
            parts: [{ type: "text", text: "previous reply" }],
            metadata: {
              sessionId: "session-1",
              createdAt: new Date("2026-07-23T00:00:00.000Z"),
            },
          },
        ],
      },
    });
    await session.start([{ type: "text", text: "continue" }]);

    expect(callOrder).toEqual(["resume", "load", "new"]);
    expect(upgradedConnection.resumeSession).toHaveBeenCalledWith({
      sessionId: "acp-existing",
      cwd: "/tmp/project",
      additionalDirectories: ["/tmp/secondary"],
      mcpServers: [],
    });
    expect(upgradedConnection.loadSession).toHaveBeenCalledWith({
      sessionId: "acp-existing",
      cwd: "/tmp/project",
      additionalDirectories: ["/tmp/secondary"],
      mcpServers: [],
    });
    expect(upgradedConnection.newSession).toHaveBeenCalledWith({
      cwd: "/tmp/project",
      additionalDirectories: ["/tmp/secondary"],
      mcpServers: [],
    });
    expect(mocks.sessionStore.persistAcpSessionId).toHaveBeenCalledWith("acp-after-upgrade");
    expect(upgradedConnection.prompt).toHaveBeenLastCalledWith({
      sessionId: "acp-after-upgrade",
      prompt: [
        {
          type: "text",
          text: expect.stringContaining("请根据以下对话历史，继续与用户进行对话"),
        },
        { type: "text", text: "continue" },
      ],
    });
    expect(mocks.connection.resumeSession).not.toHaveBeenCalled();
    expect(mocks.connection.loadSession).not.toHaveBeenCalled();
    expect(mocks.connection.newSession).not.toHaveBeenCalled();
  });

  it("converts ChatPromptPart text, image and resource_link into ACP prompt blocks", async () => {
    const imagePath = join(tempRoot, "截图 file.png");
    writeFileSync(imagePath, "image-binary");
    mocks.getOrStartProcess.mockResolvedValue({
      connection: mocks.connection,
      sessionHandlers: mocks.sessionHandlers,
      activeSessionIds: mocks.activeSessionIds,
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

  it("resolves opaque attachments and structured member files only in Main", async () => {
    mocks.readAttachmentDataUrl
      .mockResolvedValueOnce("data:image/png;base64,SU1BR0U=")
      .mockResolvedValueOnce("data:text/markdown;base64,IyBHdWlkZQ==");
    mocks.getOrStartProcess.mockResolvedValue({
      connection: mocks.connection,
      sessionHandlers: mocks.sessionHandlers,
      activeSessionIds: mocks.activeSessionIds,
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
      { type: "text", text: "review" },
      {
        type: "attachment",
        attachmentId: "11111111-1111-4111-8111-111111111111",
        mediaType: "image/png",
        filename: "diagram.png",
      },
      {
        type: "attachment",
        attachmentId: "22222222-2222-4222-8222-222222222222",
        mediaType: "text/markdown",
        filename: "notes.md",
      },
      {
        type: "workspace_file",
        ref: {
          folderId: "folder-1",
          worktreePath: "/tmp/project",
          repositoryRelativePath: "docs/guide.md",
        },
        mediaType: "text/markdown",
        filename: "guide.md",
      },
    ]);

    expect(mocks.readAttachmentDataUrl).toHaveBeenNthCalledWith(
      1,
      "workspace-1",
      "session-1",
      "11111111-1111-4111-8111-111111111111",
      "image/png"
    );
    expect(mocks.resolveSessionMemberResource).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "workspace-1" }),
      {
        folderId: "folder-1",
        worktreePath: "/tmp/project",
        repositoryRelativePath: "docs/guide.md",
      }
    );
    expect(mocks.connection.prompt).toHaveBeenCalledWith({
      sessionId: "acp-new",
      prompt: [
        { type: "text", text: "review" },
        { type: "image", mimeType: "image/png", data: "SU1BR0U=" },
        {
          type: "resource_link",
          uri: "data:text/markdown;base64,IyBHdWlkZQ==",
          name: "notes.md",
          mimeType: "text/markdown",
        },
        {
          type: "resource_link",
          uri: "file:///tmp/project/docs/guide.md",
          name: "guide.md",
          mimeType: "text/markdown",
        },
      ],
    });
  });

  it("emits PROMPT_CAPABILITY_MISMATCH and does not prompt when capabilities reject a part", async () => {
    mocks.getOrStartProcess.mockResolvedValue({
      connection: mocks.connection,
      sessionHandlers: mocks.sessionHandlers,
      activeSessionIds: mocks.activeSessionIds,
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
      mocks.sessionStore.loadRecoveryState.mockResolvedValue({
        acpSessionId: "acp-existing",
        configOptions: [],
      });
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

    it("skips direct prompt for a cold session and restores persisted config before prompting", async () => {
      const persistedOptions = [
        {
          ...sampleOptions[0],
          currentValue: "opus",
          options: [
            { value: "sonnet", name: "Sonnet" },
            { value: "opus", name: "Opus" },
          ],
        },
      ];
      const defaultOptions = [
        {
          ...persistedOptions[0],
          currentValue: "sonnet",
        },
      ];
      mocks.hasActiveAcpSession.mockReturnValue(false);
      mocks.sessionStore.loadRecoveryState.mockResolvedValue({
        acpSessionId: "acp-existing",
        configOptions: persistedOptions,
      });
      mocks.connection.resumeSession.mockResolvedValueOnce({ configOptions: defaultOptions });
      mocks.connection.setSessionConfigOption.mockResolvedValueOnce({
        configOptions: persistedOptions,
      });

      const session = await createSession();
      const seen: SessionEvent[] = [];
      session.on("event", (event) => seen.push(event));
      await session.start([{ type: "text", text: "continue" }]);

      expect(mocks.connection.resumeSession).toHaveBeenCalledOnce();
      expect(mocks.connection.setSessionConfigOption).toHaveBeenCalledWith({
        sessionId: "acp-existing",
        configId: "model",
        value: "opus",
      });
      expect(mocks.connection.setSessionConfigOption.mock.invocationCallOrder[0]).toBeLessThan(
        mocks.connection.prompt.mock.invocationCallOrder[0]
      );
      expect(seen.filter((event) => event.kind === "config_options_update")).toEqual([
        { kind: "config_options_update", options: persistedOptions },
      ]);
    });

    it("forces config confirmation when resume omits configOptions", async () => {
      mocks.hasActiveAcpSession.mockReturnValue(false);
      mocks.sessionStore.loadRecoveryState.mockResolvedValue({
        acpSessionId: "acp-existing",
        configOptions: sampleOptions,
      });
      mocks.connection.resumeSession.mockResolvedValueOnce({});
      mocks.connection.setSessionConfigOption.mockResolvedValueOnce({
        configOptions: sampleOptions,
      });

      const session = await createSession();
      await session.start([{ type: "text", text: "continue" }]);

      expect(mocks.connection.setSessionConfigOption).toHaveBeenCalledWith({
        sessionId: "acp-existing",
        configId: "model",
        value: "sonnet",
      });
      expect(mocks.connection.prompt).toHaveBeenCalledOnce();
    });

    it("does not prompt or publish lifecycle defaults when config recovery fails", async () => {
      const persistedOptions = [
        {
          ...sampleOptions[0],
          currentValue: "opus",
          options: [
            { value: "sonnet", name: "Sonnet" },
            { value: "opus", name: "Opus" },
          ],
        },
      ];
      mocks.hasActiveAcpSession.mockReturnValue(false);
      mocks.sessionStore.loadRecoveryState.mockResolvedValue({
        acpSessionId: "acp-existing",
        configOptions: persistedOptions,
      });
      mocks.connection.resumeSession.mockResolvedValueOnce({
        configOptions: [{ ...persistedOptions[0], currentValue: "sonnet" }],
      });
      mocks.connection.setSessionConfigOption.mockRejectedValueOnce(new Error("transport closed"));

      const session = await createSession();
      const seen: SessionEvent[] = [];
      session.on("event", (event) => seen.push(event));
      await session.start([{ type: "text", text: "continue" }]);

      expect(mocks.connection.prompt).not.toHaveBeenCalled();
      expect(seen).not.toContainEqual(expect.objectContaining({ kind: "config_options_update" }));
      expect(seen).toContainEqual(
        expect.objectContaining({ kind: "error", message: "transport closed" })
      );
    });

    it("restores persisted config on a fresh fallback before its first prompt", async () => {
      const persistedOptions = [
        {
          ...sampleOptions[0],
          currentValue: "opus",
          options: [
            { value: "sonnet", name: "Sonnet" },
            { value: "opus", name: "Opus" },
          ],
        },
      ];
      mocks.hasActiveAcpSession.mockReturnValue(false);
      mocks.sessionStore.loadRecoveryState.mockResolvedValue({
        acpSessionId: "acp-existing",
        configOptions: persistedOptions,
      });
      mocks.connection.resumeSession.mockRejectedValueOnce(new Error("session not found"));
      mocks.connection.loadSession.mockRejectedValueOnce(new Error("session not found"));
      mocks.connection.newSession.mockResolvedValueOnce({
        sessionId: "acp-new",
        configOptions: [{ ...persistedOptions[0], currentValue: "sonnet" }],
      });
      mocks.connection.setSessionConfigOption.mockResolvedValueOnce({
        configOptions: persistedOptions,
      });

      const session = await createSession();
      await session.start([{ type: "text", text: "continue" }]);

      expect(mocks.connection.newSession).toHaveBeenCalledOnce();
      expect(mocks.connection.setSessionConfigOption).toHaveBeenCalledWith({
        sessionId: "acp-new",
        configId: "model",
        value: "opus",
      });
      expect(mocks.connection.setSessionConfigOption.mock.invocationCallOrder[0]).toBeLessThan(
        mocks.connection.prompt.mock.invocationCallOrder[0]
      );
      expect(mocks.sessionStore.persistAcpSessionId).toHaveBeenCalledWith("acp-new");
    });

    it("emits config_options_update from loadSession response even with suppressReplay", async () => {
      mocks.getOrStartProcess.mockResolvedValue({
        connection: mocks.connection,
        sessionHandlers: mocks.sessionHandlers,
        activeSessionIds: mocks.activeSessionIds,
        initializeResponse: initializeResponse({
          agentCapabilities: {
            loadSession: true,
            sessionCapabilities: { close: {}, list: {} },
          },
        }),
      });
      mocks.sessionStore.loadRecoveryState.mockResolvedValue({
        acpSessionId: "acp-existing",
        configOptions: [],
      });
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
      mocks.sessionStore.loadRecoveryState.mockResolvedValue({
        acpSessionId: "acp-existing",
        configOptions: [],
      });

      const session = await createSession();
      const seen: SessionEvent[] = [];
      session.on("event", (event) => seen.push(event));
      await session.start([{ type: "text", text: "hello" }]);

      expect(seen).not.toContainEqual(expect.objectContaining({ kind: "config_options_update" }));
    });
  });
});
