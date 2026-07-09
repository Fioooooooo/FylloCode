import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionMeta } from "@main/infra/storage/session-store";
import { IpcErrorCodes } from "@shared/constants/error-codes";

const mocks = vi.hoisted(() => ({
  loadProject: vi.fn(),
  loadSessionMeta: vi.fn(),
  patchSessionMeta: vi.fn(),
  getOrStartProcess: vi.fn(),
  setSessionConfigOption: vi.fn(),
}));

vi.mock("@main/infra/storage/project-store", () => ({
  loadProject: mocks.loadProject,
}));

vi.mock("@main/infra/storage/session-store", () => ({
  loadSessionMeta: mocks.loadSessionMeta,
  patchSessionMeta: mocks.patchSessionMeta,
}));

vi.mock("@main/infra/process/acp-process-pool", () => ({
  getOrStartProcess: mocks.getOrStartProcess,
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
    mocks.loadProject.mockResolvedValue({ id: "p1", path: "/tmp/project" });
    mocks.getOrStartProcess.mockResolvedValue({
      connection: { setSessionConfigOption: mocks.setSessionConfigOption },
    });
    mocks.setSessionConfigOption.mockResolvedValue({
      configOptions: [{ ...flatModelSchema, currentValue: "haiku" }],
    });
    mocks.patchSessionMeta.mockResolvedValue(makeMeta());
  });

  it("returns normalized configOptions and persists them on success", async () => {
    mocks.loadSessionMeta.mockResolvedValue(makeMeta({ configOptions: [flatModelSchema] }));

    const result = await setConfigOption({
      projectId: "p1",
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
      "/tmp/project",
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
        projectId: "p1",
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
        projectId: "p1",
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
      projectId: "p1",
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
        projectId: "p1",
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
        projectId: "p1",
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
        projectId: "p1",
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
      projectId: "p1",
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
      projectId: "p1",
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
});
