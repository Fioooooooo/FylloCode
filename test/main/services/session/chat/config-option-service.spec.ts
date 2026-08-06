import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionMeta } from "@main/infra/storage/session-store";
import { IpcErrorCodes } from "@shared/constants/error-codes";

const mocks = vi.hoisted(() => ({
  ensureSessionWorkspaceSnapshot: vi.fn(),
  assertAgentWorkspaceCompatibility: vi.fn(),
  loadSessionMeta: vi.fn(),
  patchSessionMeta: vi.fn(),
  getOrStartProcess: vi.fn(),
  hasActiveAcpSession: vi.fn(),
  hasActiveMcpActivation: vi.fn(),
  activeSessionIds: new Set<string>(),
  resumeSession: vi.fn(),
  loadSession: vi.fn(),
  newSession: vi.fn(),
  setSessionConfigOption: vi.fn(),
  createBundledMcpActivation: vi.fn(),
  revokeBundledMcpActivation: vi.fn(),
  toAcpMcpServer: vi.fn(),
  createSessionMcpWorkspaceDescriptor: vi.fn(),
}));

vi.mock("@main/services/session/chat/chat-service", () => ({
  ensureSessionWorkspaceSnapshot: mocks.ensureSessionWorkspaceSnapshot,
}));

vi.mock("@main/services/session/chat/agent-workspace-compatibility", () => ({
  assertAgentWorkspaceCompatibility: mocks.assertAgentWorkspaceCompatibility,
}));

vi.mock("@main/infra/storage/session-store", () => ({
  loadSessionMeta: mocks.loadSessionMeta,
  patchSessionMeta: mocks.patchSessionMeta,
}));

vi.mock("@main/infra/process/acp-process-pool", () => ({
  getOrStartProcess: mocks.getOrStartProcess,
  hasActiveAcpSession: mocks.hasActiveAcpSession,
  hasActiveMcpActivation: mocks.hasActiveMcpActivation,
  markAcpSessionActive: vi.fn((entry: { activeSessionIds: Set<string> }, sessionId: string) => {
    entry.activeSessionIds.add(sessionId);
  }),
  forgetActiveAcpSession: vi.fn((entry: { activeSessionIds: Set<string> }, sessionId: string) => {
    entry.activeSessionIds.delete(sessionId);
  }),
}));

vi.mock("@main/infra/mcp/bundled-mcp-servers", () => ({
  createBundledMcpActivation: mocks.createBundledMcpActivation,
  revokeBundledMcpActivation: mocks.revokeBundledMcpActivation,
  toAcpMcpServer: mocks.toAcpMcpServer,
}));

vi.mock("@main/services/session/chat/mcp-workspace-descriptor", () => ({
  createSessionMcpWorkspaceDescriptor: mocks.createSessionMcpWorkspaceDescriptor,
}));

vi.mock("@main/infra/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { setConfigOption } from "@main/services/session/chat/config-option-service";

function makeMeta(overrides: Partial<SessionMeta> = {}): SessionMeta {
  return {
    sessionId: "session-1",
    acpSessionId: "acp-1",
    agentId: "claude-acp",
    sessionMode: "fyllocode",
    title: "T",
    turnCount: 0,
    tokenUsage: { used: 0, size: 0 },
    createdAt: "2026-05-14T00:00:00.000Z",
    updatedAt: "2026-05-14T00:00:00.000Z",
    ...overrides,
  };
}

const flatModelSchema = {
  type: "select" as const,
  id: "model",
  name: "Model",
  currentValue: "sonnet",
  options: [
    { value: "sonnet", name: "Sonnet" },
    { value: "haiku", name: "Haiku" },
  ],
};

const groupedModelSchema = {
  type: "select" as const,
  id: "model",
  name: "Model",
  currentValue: "sonnet",
  options: [
    {
      group: "anthropic",
      name: "Anthropic",
      options: [
        { value: "sonnet", name: "Sonnet" },
        { value: "haiku", name: "Haiku" },
      ],
    },
  ],
};

describe("setConfigOption", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.activeSessionIds.clear();
    mocks.ensureSessionWorkspaceSnapshot.mockResolvedValue({
      workspaceId: "w1",
      workspaceKind: "folder",
      primaryFolderId: "folder-1",
      folders: [{ folderId: "folder-1", folderName: "Project", folderPath: "/tmp/project" }],
      cwd: "/tmp/project",
      additionalDirectories: [],
    });
    mocks.assertAgentWorkspaceCompatibility.mockResolvedValue(undefined);
    mocks.getOrStartProcess.mockResolvedValue({
      connection: {
        resumeSession: mocks.resumeSession,
        loadSession: mocks.loadSession,
        newSession: mocks.newSession,
        setSessionConfigOption: mocks.setSessionConfigOption,
      },
      initializeResponse: {
        protocolVersion: 1,
        agentCapabilities: {
          loadSession: true,
          sessionCapabilities: { resume: {} },
        },
      },
      activeSessionIds: mocks.activeSessionIds,
    });
    mocks.hasActiveAcpSession.mockReturnValue(true);
    mocks.hasActiveMcpActivation.mockReturnValue(true);
    mocks.createBundledMcpActivation.mockResolvedValue({ servers: [], activationId: null });
    mocks.createSessionMcpWorkspaceDescriptor.mockResolvedValue({
      version: 2,
      workspaceId: "w1",
      workspaceKind: "folder",
      primaryFolderId: "folder-1",
      folders: [{ folderId: "folder-1", folderName: "Project", folderPath: "/tmp/project" }],
      workspaceDataDir: "/tmp/workspace-data",
      sessionId: "session-1",
    });
    mocks.toAcpMcpServer.mockImplementation((value: unknown) => value);
    mocks.resumeSession.mockResolvedValue({ configOptions: [flatModelSchema] });
    mocks.loadSession.mockResolvedValue({ configOptions: [flatModelSchema] });
    mocks.setSessionConfigOption.mockResolvedValue({
      configOptions: [{ ...flatModelSchema, currentValue: "haiku" }],
    });
    mocks.patchSessionMeta.mockResolvedValue(makeMeta());
  });

  it("returns normalized configOptions and persists them on success", async () => {
    mocks.loadSessionMeta.mockResolvedValue(makeMeta({ configOptions: [flatModelSchema] }));

    const result = await setConfigOption({
      workspaceId: "w1",
      sessionId: "session-1",
      configId: "model",
      type: "select",
      value: "haiku",
    });

    expect(mocks.setSessionConfigOption).toHaveBeenCalledWith({
      sessionId: "acp-1",
      configId: "model",
      value: "haiku",
    });
    expect(mocks.patchSessionMeta).toHaveBeenCalledWith(
      "w1",
      "session-1",
      expect.objectContaining({
        configOptions: result.configOptions,
        updatedAt: expect.any(String),
      })
    );
    expect(result.configOptions[0]).toMatchObject({ id: "model", currentValue: "haiku" });
  });

  it("returns VALIDATION_ERROR when meta has no acpSessionId", async () => {
    mocks.loadSessionMeta.mockResolvedValue(makeMeta({ acpSessionId: undefined }));

    await expect(
      setConfigOption({
        workspaceId: "w1",
        sessionId: "session-1",
        configId: "model",
        type: "select",
        value: "haiku",
      })
    ).rejects.toMatchObject({ code: IpcErrorCodes.VALIDATION_ERROR });
    expect(mocks.setSessionConfigOption).not.toHaveBeenCalled();
  });

  it("returns CONFIG_OPTION_INVALID_VALUE when value is not in flat schema", async () => {
    mocks.loadSessionMeta.mockResolvedValue(makeMeta({ configOptions: [flatModelSchema] }));

    await expect(
      setConfigOption({
        workspaceId: "w1",
        sessionId: "session-1",
        configId: "model",
        type: "select",
        value: "gpt-5",
      })
    ).rejects.toMatchObject({ code: IpcErrorCodes.CONFIG_OPTION_INVALID_VALUE });
    expect(mocks.setSessionConfigOption).not.toHaveBeenCalled();
  });

  it("accepts grouped schema and forwards RPC when value matches a group entry", async () => {
    mocks.loadSessionMeta.mockResolvedValue(makeMeta({ configOptions: [groupedModelSchema] }));

    await setConfigOption({
      workspaceId: "w1",
      sessionId: "session-1",
      configId: "model",
      type: "select",
      value: "haiku",
    });

    expect(mocks.setSessionConfigOption).toHaveBeenCalledWith({
      sessionId: "acp-1",
      configId: "model",
      value: "haiku",
    });
  });

  it("rejects grouped schema when value matches no group entry", async () => {
    mocks.loadSessionMeta.mockResolvedValue(makeMeta({ configOptions: [groupedModelSchema] }));

    await expect(
      setConfigOption({
        workspaceId: "w1",
        sessionId: "session-1",
        configId: "model",
        type: "select",
        value: "gpt-5",
      })
    ).rejects.toMatchObject({ code: IpcErrorCodes.CONFIG_OPTION_INVALID_VALUE });
  });

  it("maps -32601 RPC error to CONFIG_OPTION_NOT_SUPPORTED", async () => {
    mocks.loadSessionMeta.mockResolvedValue(makeMeta({ configOptions: [flatModelSchema] }));
    mocks.setSessionConfigOption.mockRejectedValueOnce({
      code: -32601,
      message: "method not found",
    });

    await expect(
      setConfigOption({
        workspaceId: "w1",
        sessionId: "session-1",
        configId: "model",
        type: "select",
        value: "haiku",
      })
    ).rejects.toMatchObject({ code: IpcErrorCodes.CONFIG_OPTION_NOT_SUPPORTED });
  });

  it("maps other RPC errors to ACP_ERROR", async () => {
    mocks.loadSessionMeta.mockResolvedValue(makeMeta({ configOptions: [flatModelSchema] }));
    mocks.setSessionConfigOption.mockRejectedValueOnce(new Error("network down"));

    await expect(
      setConfigOption({
        workspaceId: "w1",
        sessionId: "session-1",
        configId: "model",
        type: "select",
        value: "haiku",
      })
    ).rejects.toMatchObject({ code: IpcErrorCodes.ACP_ERROR });
  });

  it("skips pre-validation and forwards RPC when meta has no schema", async () => {
    mocks.loadSessionMeta.mockResolvedValue(makeMeta({ configOptions: undefined }));

    await setConfigOption({
      workspaceId: "w1",
      sessionId: "session-1",
      configId: "model",
      type: "select",
      value: "anything",
    });

    expect(mocks.setSessionConfigOption).toHaveBeenCalledWith({
      sessionId: "acp-1",
      configId: "model",
      value: "anything",
    });
  });

  it("forwards boolean payload with type field", async () => {
    mocks.loadSessionMeta.mockResolvedValue(
      makeMeta({
        configOptions: [{ type: "boolean", id: "stream", name: "Stream", currentValue: false }],
      })
    );
    mocks.setSessionConfigOption.mockResolvedValueOnce({
      configOptions: [{ type: "boolean", id: "stream", name: "Stream", currentValue: true }],
    });

    await setConfigOption({
      workspaceId: "w1",
      sessionId: "session-1",
      configId: "stream",
      type: "boolean",
      value: true,
    });

    expect(mocks.setSessionConfigOption).toHaveBeenCalledWith({
      sessionId: "acp-1",
      configId: "stream",
      type: "boolean",
      value: true,
    });
  });

  it("activates a cold session, restores persisted config, then applies the user value", async () => {
    mocks.hasActiveAcpSession.mockReturnValue(false);
    mocks.ensureSessionWorkspaceSnapshot.mockResolvedValueOnce({
      workspaceId: "w1",
      workspaceKind: "collection",
      primaryFolderId: "folder-1",
      folders: [
        { folderId: "folder-1", folderName: "Primary", folderPath: "/tmp/project" },
        { folderId: "folder-2", folderName: "Secondary", folderPath: "/tmp/secondary" },
      ],
      cwd: "/tmp/project",
      additionalDirectories: ["/tmp/secondary"],
    });
    mocks.loadSessionMeta.mockResolvedValue(
      makeMeta({
        configOptions: [{ ...flatModelSchema, currentValue: "haiku" }],
      })
    );
    mocks.resumeSession.mockResolvedValue({
      configOptions: [{ ...flatModelSchema, currentValue: "sonnet" }],
    });
    mocks.setSessionConfigOption
      .mockResolvedValueOnce({
        configOptions: [{ ...flatModelSchema, currentValue: "haiku" }],
      })
      .mockResolvedValueOnce({
        configOptions: [{ ...flatModelSchema, currentValue: "sonnet" }],
      });

    await setConfigOption({
      workspaceId: "w1",
      sessionId: "session-1",
      configId: "model",
      type: "select",
      value: "sonnet",
    });

    expect(mocks.resumeSession).toHaveBeenCalledWith(
      expect.objectContaining({
        cwd: "/tmp/project",
        additionalDirectories: ["/tmp/secondary"],
      })
    );
    expect(mocks.setSessionConfigOption.mock.calls).toEqual([
      [{ sessionId: "acp-1", configId: "model", value: "haiku" }],
      [{ sessionId: "acp-1", configId: "model", value: "sonnet" }],
    ]);
    expect(mocks.patchSessionMeta).toHaveBeenCalledOnce();
  });

  it("does not set or patch when a cold session cannot be activated", async () => {
    mocks.hasActiveAcpSession.mockReturnValue(false);
    mocks.loadSessionMeta.mockResolvedValue(makeMeta({ configOptions: [flatModelSchema] }));
    mocks.resumeSession.mockRejectedValue(new Error("session not found"));
    mocks.loadSession.mockRejectedValue(new Error("session not found"));

    await expect(
      setConfigOption({
        workspaceId: "w1",
        sessionId: "session-1",
        configId: "model",
        type: "select",
        value: "haiku",
      })
    ).rejects.toMatchObject({ code: IpcErrorCodes.ACP_ERROR });
    expect(mocks.newSession).not.toHaveBeenCalled();
    expect(mocks.setSessionConfigOption).not.toHaveBeenCalled();
    expect(mocks.patchSessionMeta).not.toHaveBeenCalled();
  });

  it("validates the requested value against the recovered live schema", async () => {
    mocks.hasActiveAcpSession.mockReturnValue(false);
    mocks.loadSessionMeta.mockResolvedValue(makeMeta({ configOptions: [flatModelSchema] }));
    mocks.resumeSession.mockResolvedValue({
      configOptions: [
        {
          ...flatModelSchema,
          options: [{ value: "sonnet", name: "Sonnet" }],
        },
      ],
    });

    await expect(
      setConfigOption({
        workspaceId: "w1",
        sessionId: "session-1",
        configId: "model",
        type: "select",
        value: "haiku",
      })
    ).rejects.toMatchObject({ code: IpcErrorCodes.CONFIG_OPTION_INVALID_VALUE });
    expect(mocks.setSessionConfigOption).not.toHaveBeenCalled();
    expect(mocks.patchSessionMeta).not.toHaveBeenCalled();
  });
});
