import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ipcMain } from "electron";
import { AutomationWorkflowProposalChannels } from "@shared/ipc/automation/workflow-proposal.channels";

const mocks = vi.hoisted(() => ({
  requireWorkspaceSender: vi.fn(),
  getRequiredWorkspaceInfo: vi.fn(),
  assertSessionBelongsToWorkspace: vi.fn(),
  listProposals: vi.fn(),
  getProposalDetail: vi.fn(),
  confirmProposal: vi.fn(),
  cancelProposal: vi.fn(),
  claimWorkflowConfirmHandoff: vi.fn(),
  makeStreamChannel: vi.fn(),
  setWakeHandler: vi.fn(),
}));

vi.mock("@main/ipc/_kit/workspace-scope", () => ({
  requireWorkspaceSender: mocks.requireWorkspaceSender,
}));
vi.mock("@main/services/workspace/_public", () => ({
  getRequiredWorkspaceInfo: mocks.getRequiredWorkspaceInfo,
}));
vi.mock("@main/services/session/chat/chat-service", () => ({
  assertSessionBelongsToWorkspace: mocks.assertSessionBelongsToWorkspace,
}));
vi.mock("@main/services/session/chat/chat-turn-service", () => ({
  claimWorkflowConfirmHandoff: mocks.claimWorkflowConfirmHandoff,
}));
vi.mock("@main/ipc/_kit/stream-channel", () => ({
  makeStreamChannel: mocks.makeStreamChannel,
}));
vi.mock("@main/services/automation/workflow/workflow-proposal-service", () => ({
  workflowProposalService: { setWakeHandler: mocks.setWakeHandler },
}));

import {
  registerWorkflowProposalHandlers,
  setupWorkflowProposalBroadcast,
  WorkflowProposalWakeDispatcher,
} from "@main/ipc/automation/workflow-proposal";

function handler(channel: string): (event: unknown, input: unknown) => Promise<unknown> {
  const call = vi.mocked(ipcMain.handle).mock.calls.find(([registered]) => registered === channel);
  expect(call).toBeTruthy();
  return call![1] as (event: unknown, input: unknown) => Promise<unknown>;
}

const service = {
  listProposals: mocks.listProposals,
  getProposalDetail: mocks.getProposalDetail,
  confirmProposal: mocks.confirmProposal,
  cancelProposal: mocks.cancelProposal,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getRequiredWorkspaceInfo.mockResolvedValue({ id: "workspace-1" });
  mocks.assertSessionBelongsToWorkspace.mockResolvedValue(undefined);
  mocks.listProposals.mockResolvedValue({ proposals: [] });
  mocks.getProposalDetail.mockResolvedValue({ proposalId: "proposal-1" });
  mocks.confirmProposal.mockResolvedValue({
    status: "confirmed",
    workflowId: "workflow-1",
    persist: "workspace",
  });
  mocks.cancelProposal.mockResolvedValue({ status: "cancelled" });
  mocks.claimWorkflowConfirmHandoff.mockResolvedValue({ status: "busy" });
  mocks.makeStreamChannel.mockReturnValue({ ok: true, data: null });
  registerWorkflowProposalHandlers(service);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Workflow Proposal IPC", () => {
  it("validates sender Workspace and parent Session before listing", async () => {
    const sender = {};
    const input = { workspaceId: "workspace-1", parentSessionId: "parent-1" };
    const result = await handler(AutomationWorkflowProposalChannels.list)({ sender }, input);

    expect(result).toEqual({ ok: true, data: { proposals: [] } });
    expect(mocks.requireWorkspaceSender).toHaveBeenCalledWith(sender, "workspace-1");
    expect(mocks.getRequiredWorkspaceInfo).toHaveBeenCalledWith("workspace-1");
    expect(mocks.assertSessionBelongsToWorkspace).toHaveBeenCalledWith("workspace-1", "parent-1");
    expect(mocks.listProposals).toHaveBeenCalledWith(input);
  });

  it("does not expose or query a proposal when the parent owner is rejected", async () => {
    mocks.assertSessionBelongsToWorkspace.mockRejectedValueOnce(
      Object.assign(new Error("wrong parent"), { code: "SESSION_RESOURCE_UNAUTHORIZED" })
    );
    const result = await handler(AutomationWorkflowProposalChannels.getDetail)(
      { sender: {} },
      { workspaceId: "workspace-1", parentSessionId: "other-parent", proposalId: "proposal-1" }
    );

    expect(result).toMatchObject({ ok: false, error: { code: "SESSION_RESOURCE_UNAUTHORIZED" } });
    expect(mocks.getProposalDetail).not.toHaveBeenCalled();
  });

  it("takes persist only from the validated confirmation input and rejects extra YAML fields", async () => {
    const input = {
      workspaceId: "workspace-1",
      parentSessionId: "parent-1",
      proposalId: "proposal-1",
      persist: "session",
    } as const;
    const result = await handler(AutomationWorkflowProposalChannels.confirm)({ sender: {} }, input);
    expect(result).toEqual({
      ok: true,
      data: { status: "confirmed", workflowId: "workflow-1", persist: "workspace" },
    });
    expect(mocks.confirmProposal).toHaveBeenCalledWith(input);

    const invalid = await handler(AutomationWorkflowProposalChannels.confirm)(
      { sender: {} },
      { ...input, yaml: "forged" }
    );
    expect(invalid).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    expect(mocks.confirmProposal).toHaveBeenCalledTimes(1);
  });

  it("dispatches confirm once with the validated owner and passes the port sink to handoff", async () => {
    const input = {
      workspaceId: "workspace-1",
      parentSessionId: "parent-1",
      proposalId: "proposal-1",
      persist: "workspace",
      streamId: "stream-1",
    } as const;
    const sink = {
      sendChunk: vi.fn(),
      sendDone: vi.fn(),
      sendError: vi.fn(),
    };
    const runner = { start: vi.fn(), cancel: vi.fn() };
    const claim = {
      status: "accepted" as const,
      start: vi.fn().mockResolvedValue(runner),
      abort: vi.fn().mockResolvedValue(undefined),
    };
    const record = { meta: { workspaceId: "workspace-1", parentSessionId: "parent-1" } };
    mocks.claimWorkflowConfirmHandoff.mockResolvedValue(claim);
    mocks.confirmProposal.mockImplementation(async (request, handoff) => {
      expect(request).toEqual({
        workspaceId: "workspace-1",
        parentSessionId: "parent-1",
        proposalId: "proposal-1",
        persist: "workspace",
      });
      expect(handoff).toBeTypeOf("function");
      await handoff(record, "workflow-1", request.persist);
      return { status: "confirmed", workflowId: "workflow-1", persist: request.persist };
    });
    mocks.makeStreamChannel.mockImplementation((options) => {
      void Promise.resolve(options.onReady(sink)).catch(() => undefined);
      return { ok: true, data: null };
    });

    const result = await handler(AutomationWorkflowProposalChannels.confirmDispatch)(
      { sender: {} },
      input
    );

    expect(result).toEqual({
      ok: true,
      data: {
        status: "accepted",
        result: { status: "confirmed", workflowId: "workflow-1", persist: "workspace" },
      },
    });
    expect(mocks.confirmProposal).toHaveBeenCalledOnce();
    expect(mocks.claimWorkflowConfirmHandoff).toHaveBeenCalledWith(
      record,
      "workflow-1",
      "workspace"
    );
    expect(claim.start).toHaveBeenCalledWith(sink);
    expect(claim.abort).not.toHaveBeenCalled();
  });

  it("returns confirmed when handoff is busy and exposes a completed fallback stream", async () => {
    const input = {
      workspaceId: "workspace-1",
      parentSessionId: "parent-1",
      proposalId: "proposal-1",
      persist: "session",
      streamId: "stream-2",
    } as const;
    const sink = { sendChunk: vi.fn(), sendDone: vi.fn(), sendError: vi.fn() };
    mocks.confirmProposal.mockImplementation(async (request, handoff) => {
      expect(await handoff({ meta: {} }, "workflow-1", request.persist)).toBe(false);
      return { status: "confirmed", workflowId: "workflow-1", persist: request.persist };
    });
    mocks.makeStreamChannel.mockImplementation((options) => {
      void Promise.resolve(options.onReady(sink))
        .then((runner) => runner.start())
        .catch(() => undefined);
      return { ok: true, data: null };
    });

    const result = await handler(AutomationWorkflowProposalChannels.confirmDispatch)(
      { sender: {} },
      input
    );

    expect(result).toMatchObject({
      ok: true,
      data: { status: "accepted", result: { status: "confirmed", persist: "session" } },
    });
    expect(sink.sendDone).toHaveBeenCalledWith(0);
  });
});

describe("Workflow Proposal wake dispatch", () => {
  it("debounces by owner and sends only the invalidation payload", () => {
    vi.useFakeTimers();
    const sendToWorkspace = vi.fn();
    const dispatcher = new WorkflowProposalWakeDispatcher({ sendToWorkspace });
    const payload = {
      workspaceId: "workspace-1",
      parentSessionId: "parent-1",
      proposalId: "proposal-1",
    };
    dispatcher.notify(payload);
    dispatcher.notify({ ...payload });
    vi.advanceTimersByTime(40);
    expect(sendToWorkspace).toHaveBeenCalledOnce();
    expect(sendToWorkspace.mock.calls[0]?.[2]).toEqual(payload);
    expect(sendToWorkspace.mock.calls[0]?.[2]).not.toHaveProperty("yaml");
    dispatcher.dispose();
  });

  it("binds and cleans up the service wake handler", () => {
    vi.useFakeTimers();
    const sendToWorkspace = vi.fn();
    const serviceWake = vi.fn();
    const cleanup = setupWorkflowProposalBroadcast(
      { sendToWorkspace },
      { setWakeHandler: serviceWake },
      { delayMs: 10 }
    );
    const handler = serviceWake.mock.calls[0]?.[0] as
      | ((payload: { workspaceId: string; parentSessionId: string; proposalId: string }) => void)
      | undefined;
    handler?.({ workspaceId: "workspace-1", parentSessionId: "parent-1", proposalId: "p-1" });
    vi.advanceTimersByTime(10);
    expect(sendToWorkspace).toHaveBeenCalledWith(
      "workspace-1",
      AutomationWorkflowProposalChannels.wake,
      { workspaceId: "workspace-1", parentSessionId: "parent-1", proposalId: "p-1" }
    );
    cleanup();
    expect(serviceWake).toHaveBeenLastCalledWith(null);
  });
});
