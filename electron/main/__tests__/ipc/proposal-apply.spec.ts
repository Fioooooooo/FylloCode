import { beforeEach, describe, expect, it, vi } from "vitest";
import { ipcMain } from "electron";
import { ProposalChannels } from "@shared/types/channels";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import type { SessionEvent } from "@main/domain/chat/session-events";
import type { AcpSessionOpts } from "@main/services/chat/acp-session";
import { ApplyStageAcpSessionStore } from "@main/infra/storage/apply-stage-acp-session-store";
import { ArchiveAcpSessionStore } from "@main/infra/storage/archive-acp-session-store";

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
    prependReminderToLastUserMessage: vi.fn(),
    loadApplyRunMeta: vi.fn(),
    loadApplyRunMessages: vi.fn(),
    loadArchiveRunMeta: vi.fn(),
    loadArchiveMessages: vi.fn(),
    saveArchiveRunMeta: vi.fn(),
    updateApplyRunStageAcpSessionId: vi.fn(),
    updateArchiveRunAcpSessionId: vi.fn(),
    resolveProjectPath: vi.fn(),
    resolveApplyRunChangeId: vi.fn(),
    updateRunMetaIfCurrent: vi.fn(),
    getCompletedApplyStageIndex: vi.fn(),
    assemblerApply: vi.fn(),
    assemblerFlush: vi.fn(),
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
  archiveMessagesPath: vi.fn(
    (projectPath: string, changeId: string) => `${projectPath}/${changeId}/archive.messages.jsonl`
  ),
  loadApplyRunMeta: mocks.loadApplyRunMeta,
  loadApplyRunMessages: mocks.loadApplyRunMessages,
  loadArchiveRunMeta: mocks.loadArchiveRunMeta,
  loadArchiveMessages: mocks.loadArchiveMessages,
  saveArchiveRunMeta: mocks.saveArchiveRunMeta,
  updateApplyRunStageAcpSessionId: mocks.updateApplyRunStageAcpSessionId,
  updateArchiveRunAcpSessionId: mocks.updateArchiveRunAcpSessionId,
  stageMessagesPath: vi.fn(
    (projectPath: string, changeId: string, stageIndex: number) =>
      `${projectPath}/${changeId}/stage-${stageIndex}.messages.jsonl`
  ),
}));

vi.mock("@main/infra/storage/message-reminder-store", () => ({
  prependReminderToLastUserMessage: mocks.prependReminderToLastUserMessage,
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

const runMeta = {
  runId: "run-1",
  changeId: "change-1",
  workflowId: "workflow-1",
  stages: [{ id: "stage-1", name: "Apply", type: "proposal-apply", agent: "claude-acp" }],
  currentStageIndex: 0,
  stageAcpSessionIds: { 0: "acp-1" },
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
    mocks.loadArchiveRunMeta.mockResolvedValue(null);
    mocks.updateApplyRunStageAcpSessionId.mockResolvedValue(undefined);
    mocks.updateArchiveRunAcpSessionId.mockResolvedValue(undefined);
    mocks.getCompletedApplyStageIndex.mockReturnValue(0);
    mocks.assemblerFlush.mockReturnValue(null);
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

  it("rejects stageStream when stage.agent is missing", async () => {
    mocks.loadApplyRunMeta.mockResolvedValueOnce({
      ...runMeta,
      stages: [{ id: "stage-1", name: "Apply", type: "proposal-apply" }],
    });

    handler(ProposalChannels.stageStream)(
      { sender: { postMessage: vi.fn() } },
      { runId: "run-1", stageIndex: 0, projectId: "project-1", changeId: "change-1" }
    );

    const sink = { sendChunk: vi.fn(), sendDone: vi.fn(), sendError: vi.fn() };
    await expect(mocks.onReady!(sink)).rejects.toMatchObject({
      code: IpcErrorCodes.VALIDATION_ERROR,
    });
    expect(mocks.appendApplyRunMessage).not.toHaveBeenCalled();
    expect(mocks.register).not.toHaveBeenCalled();
  });

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
    mocks.assemblerFlush.mockReturnValueOnce({
      id: "archive-assistant-1",
      role: "assistant",
      parts: [{ type: "text", text: "archive result" }],
      metadata: {
        sessionId: "run-1-0",
        createdAt: new Date("2026-05-08T00:00:00.000Z"),
      },
    });

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
      expect.objectContaining({ id: "archive-assistant-1", role: "assistant" })
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

  it("passes apply owner, reminder context, and hook without extra user chunks", async () => {
    const reminderPart = {
      type: "text",
      text: "<system-reminder>\nbody\n</system-reminder>",
    } as const;
    handler(ProposalChannels.stageStream)(
      { sender: { postMessage: vi.fn() } },
      { runId: "run-1", stageIndex: 0, projectId: "project-1", changeId: "change-1" }
    );

    const sink = { sendChunk: vi.fn(), sendDone: vi.fn(), sendError: vi.fn() };
    await mocks.onReady!(sink);

    const acpSessionMock = vi.mocked((await import("@main/services/chat/acp-session")).AcpSession);
    const opts = acpSessionMock.mock.calls[0]?.[0] as AcpSessionOpts | undefined;
    expect(opts).toBeDefined();
    if (!opts?.onReminderInjected) {
      throw new Error("Expected onReminderInjected hook");
    }

    expect(opts).toEqual(
      expect.objectContaining({
        cwd: "/tmp/project",
        owner: "apply",
        reminderContext: {
          changeId: "change-1",
          stageIndex: 0,
          runId: "run-1",
          worktreePath: undefined,
        },
      })
    );
    expect(opts.sessionStore).toBeInstanceOf(ApplyStageAcpSessionStore);
    await opts.sessionStore.persistAcpSessionId("acp-stage-2");
    expect(mocks.updateApplyRunStageAcpSessionId).toHaveBeenCalledWith(
      "/tmp/project",
      "change-1",
      "run-1",
      0,
      "acp-stage-2"
    );

    await opts.onReminderInjected(reminderPart);

    expect(mocks.prependReminderToLastUserMessage).toHaveBeenCalledWith(
      "/tmp/project/change-1/stage-0.messages.jsonl",
      reminderPart
    );
    expect(
      sink.sendChunk.mock.calls.filter(([chunk]) => chunk.kind === "user_message")
    ).toHaveLength(1);
  });

  it("does not persist stage acpSessionId from the session_id_resolved event in the handler", async () => {
    handler(ProposalChannels.stageStream)(
      { sender: { postMessage: vi.fn() } },
      { runId: "run-1", stageIndex: 0, projectId: "project-1", changeId: "change-1" }
    );

    const sink = { sendChunk: vi.fn(), sendDone: vi.fn(), sendError: vi.fn() };
    await mocks.onReady!(sink);

    mocks.eventHandler!({ type: "session_id_resolved", acpSessionId: "acp-stage-3" });

    expect(mocks.updateRunMetaIfCurrent).not.toHaveBeenCalled();
  });

  it("uses apply run worktreePath as cwd when present", async () => {
    mocks.loadApplyRunMeta.mockResolvedValueOnce({
      ...runMeta,
      worktreePath: "/tmp/project/.worktrees/change-1",
    });

    handler(ProposalChannels.stageStream)(
      { sender: { postMessage: vi.fn() } },
      { runId: "run-1", stageIndex: 0, projectId: "project-1", changeId: "change-1" }
    );

    const sink = { sendChunk: vi.fn(), sendDone: vi.fn(), sendError: vi.fn() };
    await mocks.onReady!(sink);

    const acpSessionMock = vi.mocked((await import("@main/services/chat/acp-session")).AcpSession);
    const opts = acpSessionMock.mock.calls[0]?.[0] as AcpSessionOpts | undefined;
    expect(opts).toEqual(
      expect.objectContaining({
        cwd: "/tmp/project/.worktrees/change-1",
        projectPath: "/tmp/project",
        reminderContext: expect.objectContaining({
          worktreePath: "/tmp/project/.worktrees/change-1",
        }),
      })
    );
  });

  it("forwards stage reasoning_delta through assembler and sink", async () => {
    handler(ProposalChannels.stageStream)(
      { sender: { postMessage: vi.fn() } },
      { runId: "run-1", stageIndex: 0, projectId: "project-1", changeId: "change-1" }
    );

    const sink = { sendChunk: vi.fn(), sendDone: vi.fn(), sendError: vi.fn() };
    await mocks.onReady!(sink);
    sink.sendChunk.mockClear();

    const event: SessionEvent = { type: "reasoning_delta", text: "thinking" };
    mocks.eventHandler!(event);

    expect(mocks.assemblerApply).toHaveBeenCalledWith(event);
    expect(sink.sendChunk).toHaveBeenCalledWith({
      kind: "reasoning_delta",
      text: "thinking",
    });
  });

  it("ignores stage available_commands_update", async () => {
    handler(ProposalChannels.stageStream)(
      { sender: { postMessage: vi.fn() } },
      { runId: "run-1", stageIndex: 0, projectId: "project-1", changeId: "change-1" }
    );

    const sink = { sendChunk: vi.fn(), sendDone: vi.fn(), sendError: vi.fn() };
    await mocks.onReady!(sink);
    sink.sendChunk.mockClear();

    mocks.eventHandler!({
      type: "available_commands_update",
      commands: [{ name: "review", description: "Review code" }],
    });

    expect(mocks.assemblerApply).not.toHaveBeenCalled();
    expect(sink.sendChunk).not.toHaveBeenCalled();
    expect(mocks.appendApplyRunMessage).toHaveBeenCalledTimes(1);
    expect(mocks.updateRunMetaIfCurrent).not.toHaveBeenCalled();
  });

  it("passes archive owner and hook for archive reminder persistence", async () => {
    mocks.loadApplyRunMeta.mockResolvedValueOnce({ ...runMeta, status: "done" });
    const reminderPart = {
      type: "text",
      text: "<system-reminder>\nbody\n</system-reminder>",
    } as const;

    handler(ProposalChannels.archive)(
      { sender: { postMessage: vi.fn() } },
      { projectId: "project-1", changeId: "change-1" }
    );

    const sink = { sendChunk: vi.fn(), sendDone: vi.fn(), sendError: vi.fn() };
    await mocks.onReady!(sink);

    const calls = vi.mocked((await import("@main/services/chat/acp-session")).AcpSession).mock
      .calls;
    const [opts] = calls[calls.length - 1];
    const typedOpts = opts as AcpSessionOpts | undefined;
    expect(typedOpts).toBeDefined();
    if (!typedOpts?.onReminderInjected) {
      throw new Error("Expected onReminderInjected hook");
    }

    expect(typedOpts).toEqual(
      expect.objectContaining({
        cwd: "/tmp/project",
        fylloSessionId: "run-1-archive",
        owner: "archive",
        reminderContext: expect.objectContaining({
          changeId: "change-1",
          runId: expect.stringMatching(/^archive-/),
          worktreePath: undefined,
        }),
      })
    );
    expect(typedOpts.sessionStore).toBeInstanceOf(ArchiveAcpSessionStore);
    await expect(typedOpts.sessionStore.loadAcpSessionId()).resolves.toBeNull();
    await typedOpts.sessionStore.persistAcpSessionId("acp-archive");
    expect(mocks.updateArchiveRunAcpSessionId).toHaveBeenCalledWith(
      "/tmp/project",
      "change-1",
      "acp-archive"
    );

    await typedOpts.onReminderInjected(reminderPart);

    expect(mocks.prependReminderToLastUserMessage).toHaveBeenCalledWith(
      "/tmp/project/change-1/archive.messages.jsonl",
      reminderPart
    );
    expect(
      sink.sendChunk.mock.calls.filter(([chunk]) => chunk.kind === "user_message")
    ).toHaveLength(1);
  });

  it("uses apply run worktreePath for archive cwd when present", async () => {
    mocks.loadApplyRunMeta.mockResolvedValueOnce({
      ...runMeta,
      status: "done",
      worktreePath: "/tmp/project/.worktrees/change-1",
    });

    handler(ProposalChannels.archive)(
      { sender: { postMessage: vi.fn() } },
      { projectId: "project-1", changeId: "change-1" }
    );

    const sink = { sendChunk: vi.fn(), sendDone: vi.fn(), sendError: vi.fn() };
    await mocks.onReady!(sink);

    const calls = vi.mocked((await import("@main/services/chat/acp-session")).AcpSession).mock
      .calls;
    const [opts] = calls[calls.length - 1];
    const typedOpts = opts as AcpSessionOpts | undefined;
    expect(typedOpts).toEqual(
      expect.objectContaining({
        cwd: "/tmp/project/.worktrees/change-1",
        projectPath: "/tmp/project",
        reminderContext: expect.objectContaining({
          worktreePath: "/tmp/project/.worktrees/change-1",
        }),
      })
    );
  });

  it("rejects archive when the completed stage acpSessionId is missing", async () => {
    mocks.loadApplyRunMeta.mockResolvedValueOnce({
      ...runMeta,
      status: "done",
      stageAcpSessionIds: {},
    });

    handler(ProposalChannels.archive)(
      { sender: { postMessage: vi.fn() } },
      { projectId: "project-1", changeId: "change-1" }
    );

    const sink = { sendChunk: vi.fn(), sendDone: vi.fn(), sendError: vi.fn() };
    await expect(mocks.onReady!(sink)).rejects.toMatchObject({
      code: IpcErrorCodes.APPLY_SESSION_NOT_READY,
    });
    expect(mocks.saveArchiveRunMeta).not.toHaveBeenCalled();
  });

  it("rejects archive when the completed stage agent is missing", async () => {
    mocks.loadApplyRunMeta.mockResolvedValueOnce({
      ...runMeta,
      status: "done",
      stages: [{ id: "stage-1", name: "Apply", type: "proposal-apply" }],
    });

    handler(ProposalChannels.archive)(
      { sender: { postMessage: vi.fn() } },
      { projectId: "project-1", changeId: "change-1" }
    );

    const sink = { sendChunk: vi.fn(), sendDone: vi.fn(), sendError: vi.fn() };
    await expect(mocks.onReady!(sink)).rejects.toMatchObject({
      code: IpcErrorCodes.VALIDATION_ERROR,
    });
    expect(mocks.saveArchiveRunMeta).not.toHaveBeenCalled();
  });

  it("forwards archive reasoning_delta through assembler and sink", async () => {
    mocks.loadApplyRunMeta.mockResolvedValueOnce({ ...runMeta, status: "done" });

    handler(ProposalChannels.archive)(
      { sender: { postMessage: vi.fn() } },
      { projectId: "project-1", changeId: "change-1" }
    );

    const sink = { sendChunk: vi.fn(), sendDone: vi.fn(), sendError: vi.fn() };
    await mocks.onReady!(sink);
    sink.sendChunk.mockClear();

    const event: SessionEvent = { type: "reasoning_delta", text: "archive thought" };
    mocks.eventHandler!(event);

    expect(mocks.assemblerApply).toHaveBeenCalledWith(event);
    expect(sink.sendChunk).toHaveBeenCalledWith({
      kind: "reasoning_delta",
      text: "archive thought",
    });
  });

  it("ignores archive available_commands_update", async () => {
    mocks.loadApplyRunMeta.mockResolvedValueOnce({ ...runMeta, status: "done" });

    handler(ProposalChannels.archive)(
      { sender: { postMessage: vi.fn() } },
      { projectId: "project-1", changeId: "change-1" }
    );

    const sink = { sendChunk: vi.fn(), sendDone: vi.fn(), sendError: vi.fn() };
    await mocks.onReady!(sink);
    sink.sendChunk.mockClear();

    mocks.eventHandler!({
      type: "available_commands_update",
      commands: [{ name: "review", description: "Review code" }],
    });

    expect(mocks.assemblerApply).not.toHaveBeenCalled();
    expect(sink.sendChunk).not.toHaveBeenCalled();
    expect(mocks.appendArchiveMessage).toHaveBeenCalledTimes(1);
    expect(mocks.saveArchiveRunMeta).toHaveBeenCalledTimes(1);
  });

  it("preserves archive acpSessionId when marking archive done", async () => {
    mocks.loadApplyRunMeta.mockResolvedValueOnce({ ...runMeta, status: "done" });
    mocks.loadArchiveRunMeta.mockResolvedValueOnce({
      runId: "archive-1",
      changeId: "change-1",
      status: "running",
      startedAt: "2026-05-08T00:00:00.000Z",
      updatedAt: "2026-05-08T00:00:00.000Z",
      acpSessionId: "acp-archive",
    });

    handler(ProposalChannels.archive)(
      { sender: { postMessage: vi.fn() } },
      { projectId: "project-1", changeId: "change-1" }
    );

    const sink = { sendChunk: vi.fn(), sendDone: vi.fn(), sendError: vi.fn() };
    await mocks.onReady!(sink);

    mocks.eventHandler!({ type: "done", totalTokens: 2 });

    await vi.waitFor(() => {
      expect(mocks.saveArchiveRunMeta).toHaveBeenLastCalledWith(
        "/tmp/project",
        expect.objectContaining({
          status: "done",
          acpSessionId: "acp-archive",
        })
      );
    });
  });
});
