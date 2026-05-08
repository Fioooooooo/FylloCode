import { beforeEach, describe, expect, it, vi } from "vitest";
import { ipcMain } from "electron";
import { ProposalChannels } from "@shared/types/channels";
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
    appendApplyRunMessage: vi.fn(),
    appendArchiveMessage: vi.fn(),
    loadApplyRunMeta: vi.fn(),
    loadApplyRunMessages: vi.fn(),
    loadArchiveRunMeta: vi.fn(),
    loadArchiveMessages: vi.fn(),
    saveArchiveRunMeta: vi.fn(),
    loadSessionMeta: vi.fn(),
    resolveProjectPath: vi.fn(),
    resolveApplyRunChangeId: vi.fn(),
    updateRunMetaIfCurrent: vi.fn(),
    getCompletedApplyStageIndex: vi.fn(),
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

vi.mock("@main/infra/storage/apply-run-store", () => ({
  appendApplyRunMessage: mocks.appendApplyRunMessage,
  appendArchiveMessage: mocks.appendArchiveMessage,
  loadApplyRunMeta: mocks.loadApplyRunMeta,
  loadApplyRunMessages: mocks.loadApplyRunMessages,
  loadArchiveRunMeta: mocks.loadArchiveRunMeta,
  loadArchiveMessages: mocks.loadArchiveMessages,
  saveArchiveRunMeta: mocks.saveArchiveRunMeta,
}));

vi.mock("@main/infra/storage/session-store", () => ({
  loadSessionMeta: mocks.loadSessionMeta,
}));

vi.mock("@main/services/proposal/apply-run-service", () => ({
  buildArchiveStage: vi.fn((agentId: string) => ({
    id: "archive",
    name: "归档",
    type: "proposal-archive",
    agent: agentId,
  })),
  createApplyRun: vi.fn(),
  getCompletedApplyStageIndex: mocks.getCompletedApplyStageIndex,
  resolveApplyRunChangeId: mocks.resolveApplyRunChangeId,
  resolveProjectPath: mocks.resolveProjectPath,
  updateRunMetaIfCurrent: mocks.updateRunMetaIfCurrent,
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

const runMeta = {
  runId: "run-1",
  changeId: "change-1",
  workflowId: "workflow-1",
  stages: [{ id: "stage-1", name: "Apply", type: "proposal-apply" }],
  currentStageIndex: 0,
  stageAcpSessionIds: {},
  status: "running",
  startedAt: "2026-05-08T00:00:00.000Z",
  updatedAt: "2026-05-08T00:00:00.000Z",
} as const;

describe("registerProposalApplyHandlers", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.eventHandler = null;
    mocks.onReady = null;
    mocks.resolveProjectPath.mockResolvedValue("/tmp/project");
    mocks.resolveApplyRunChangeId.mockResolvedValue("change-1");
    mocks.loadApplyRunMeta.mockResolvedValue(runMeta);
    mocks.loadSessionMeta.mockResolvedValue({ acpSessionId: "acp-1", agentId: "claude-acp" });
    mocks.getCompletedApplyStageIndex.mockReturnValue(0);
    const { registerProposalApplyHandlers } = await import("@main/ipc/proposal-apply");
    registerProposalApplyHandlers();
  });

  function handler(channel: string): (event: unknown, input: unknown) => unknown {
    const call = vi
      .mocked(ipcMain.handle)
      .mock.calls.find(([registeredChannel]) => registeredChannel === channel);
    expect(call).toBeTruthy();
    return call![1] as (event: unknown, input: unknown) => unknown;
  }

  it("persists and sends stage user message before registering the session", async () => {
    handler(ProposalChannels.stageStream)(
      { sender: { postMessage: vi.fn() } },
      { runId: "run-1", stageIndex: 0, projectId: "project-1", changeId: "change-1" }
    );

    const sink = { sendChunk: vi.fn(), sendDone: vi.fn(), sendError: vi.fn() };
    await mocks.onReady!(sink);

    expect(mocks.appendApplyRunMessage).toHaveBeenCalledWith(
      "/tmp/project",
      "change-1",
      0,
      expect.objectContaining({ role: "user" })
    );
    expect(sink.sendChunk).toHaveBeenCalledWith({
      kind: "user_message",
      message: expect.objectContaining({ role: "user" }),
    });
    expect(mocks.appendApplyRunMessage.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.register.mock.invocationCallOrder[0]
    );
  });

  it("normalizes stage user persist failures", async () => {
    mocks.appendApplyRunMessage.mockRejectedValueOnce(new Error("disk failed"));

    handler(ProposalChannels.stageStream)(
      { sender: { postMessage: vi.fn() } },
      { runId: "run-1", stageIndex: 0, projectId: "project-1", changeId: "change-1" }
    );

    const sink = { sendChunk: vi.fn(), sendDone: vi.fn(), sendError: vi.fn() };
    await expect(mocks.onReady!(sink)).rejects.toMatchObject({
      code: IpcErrorCodes.APPLY_RUN_PERSIST_FAILED,
    });
    expect(mocks.register).not.toHaveBeenCalled();
  });

  it("persists archive meta, user message, assistant message, and done status", async () => {
    mocks.loadApplyRunMeta.mockResolvedValueOnce({ ...runMeta, status: "done" });

    handler(ProposalChannels.archive)(
      { sender: { postMessage: vi.fn() } },
      { projectId: "project-1", changeId: "change-1" }
    );

    const sink = { sendChunk: vi.fn(), sendDone: vi.fn(), sendError: vi.fn() };
    await mocks.onReady!(sink);

    expect(mocks.saveArchiveRunMeta).toHaveBeenCalledWith(
      "/tmp/project",
      expect.objectContaining({ status: "running" })
    );
    expect(mocks.appendArchiveMessage).toHaveBeenCalledWith(
      "/tmp/project",
      "change-1",
      expect.objectContaining({ role: "user" })
    );

    mocks.eventHandler!({ type: "text_delta", text: "archive result" });
    mocks.eventHandler!({ type: "done", totalTokens: 2 });

    await vi.waitFor(() => {
      expect(sink.sendDone).toHaveBeenCalledWith(2);
      expect(mocks.saveArchiveRunMeta).toHaveBeenLastCalledWith(
        "/tmp/project",
        expect.objectContaining({ status: "done" })
      );
    });
    expect(mocks.appendArchiveMessage).toHaveBeenLastCalledWith(
      "/tmp/project",
      "change-1",
      expect.objectContaining({
        role: "assistant",
        parts: [{ type: "text", text: "archive result" }],
      })
    );
  });

  it("updates archive meta before sending stream errors", async () => {
    mocks.loadApplyRunMeta.mockResolvedValueOnce({ ...runMeta, status: "done" });

    handler(ProposalChannels.archive)(
      { sender: { postMessage: vi.fn() } },
      { projectId: "project-1", changeId: "change-1" }
    );

    const sink = { sendChunk: vi.fn(), sendDone: vi.fn(), sendError: vi.fn() };
    await mocks.onReady!(sink);

    mocks.eventHandler!({ type: "error", code: "ACP_ERROR", message: "failed" });

    await vi.waitFor(() => {
      expect(mocks.saveArchiveRunMeta).toHaveBeenLastCalledWith(
        "/tmp/project",
        expect.objectContaining({ status: "error" })
      );
      expect(sink.sendError).toHaveBeenCalledWith(IpcErrorCodes.ACP_ERROR, "failed");
    });
  });

  it("loads archive meta and messages through handlers", async () => {
    mocks.loadArchiveRunMeta.mockResolvedValue({ runId: "archive-1" });
    mocks.loadArchiveMessages.mockResolvedValue([{ id: "message-1" }]);

    await expect(
      handler(ProposalChannels.loadArchive)({}, { projectId: "project-1", changeId: "change-1" })
    ).resolves.toEqual({ ok: true, data: { runId: "archive-1" } });
    await expect(
      handler(ProposalChannels.loadArchiveMessages)(
        {},
        { projectId: "project-1", changeId: "change-1" }
      )
    ).resolves.toEqual({ ok: true, data: [{ id: "message-1" }] });
  });
});
