import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ipcMain } from "electron";
import { AutomationWorkflowProposalDecisionChannels } from "@shared/ipc/automation/workflow-proposal-decision.channels";

const mocks = vi.hoisted(() => ({
  requireWorkspaceSender: vi.fn(),
  getRequiredWorkspaceInfo: vi.fn(),
  list: vi.fn(),
  reconcileWorkspace: vi.fn(),
  setWakeHandler: vi.fn(),
  setDecisionWakeHandler: vi.fn(),
  claimWorkflowDecisionTurn: vi.fn(),
  makeStreamChannel: vi.fn(),
}));

vi.mock("@main/ipc/_kit/workspace-scope", () => ({
  requireWorkspaceSender: mocks.requireWorkspaceSender,
}));
vi.mock("@main/services/workspace/_public", () => ({
  getRequiredWorkspaceInfo: mocks.getRequiredWorkspaceInfo,
}));
vi.mock("@main/services/automation/workflow/workflow-decision-service", () => ({
  workflowDecisionService: {
    list: mocks.list,
    reconcileWorkspace: mocks.reconcileWorkspace,
    setWakeHandler: mocks.setWakeHandler,
  },
}));
vi.mock("@main/services/automation/workflow/workflow-proposal-service", () => ({
  workflowProposalService: { setDecisionWakeHandler: mocks.setDecisionWakeHandler },
}));
vi.mock("@main/services/session/chat/chat-turn-service", () => ({
  claimWorkflowDecisionTurn: mocks.claimWorkflowDecisionTurn,
}));
vi.mock("@main/ipc/_kit/stream-channel", () => ({
  makeStreamChannel: mocks.makeStreamChannel,
}));

import {
  registerWorkflowProposalDecisionHandlers,
  setupWorkflowProposalDecisionBroadcast,
  WorkflowProposalDecisionWakeDispatcher,
} from "@main/ipc/automation/workflow-proposal-decision";

function handler(channel: string): (event: unknown, input: unknown) => Promise<unknown> {
  const call = vi.mocked(ipcMain.handle).mock.calls.find(([registered]) => registered === channel);
  expect(call).toBeTruthy();
  return call![1] as (event: unknown, input: unknown) => Promise<unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getRequiredWorkspaceInfo.mockResolvedValue({ id: "workspace-1" });
  mocks.reconcileWorkspace.mockResolvedValue(undefined);
  mocks.list.mockResolvedValue([]);
  mocks.claimWorkflowDecisionTurn.mockResolvedValue({ status: "busy" });
  mocks.makeStreamChannel.mockReturnValue({ ok: true, data: null });
  registerWorkflowProposalDecisionHandlers();
});

afterEach(() => vi.useRealTimers());

describe("Workflow Proposal decision IPC", () => {
  it("lists only through the owner Workspace and reconciliation service", async () => {
    const result = await handler(AutomationWorkflowProposalDecisionChannels.list)(
      { sender: {} },
      { workspaceId: "workspace-1" }
    );
    expect(result).toEqual({ ok: true, data: { decisions: [] } });
    expect(mocks.requireWorkspaceSender).toHaveBeenCalledWith({}, "workspace-1");
    expect(mocks.getRequiredWorkspaceInfo).toHaveBeenCalledWith("workspace-1");
    expect(mocks.reconcileWorkspace).toHaveBeenCalledWith("workspace-1");
    expect(mocks.list).toHaveBeenCalledWith("workspace-1");
  });

  it("does not create a stream when Main reports a busy or non-pending decision", async () => {
    const result = await handler(AutomationWorkflowProposalDecisionChannels.dispatch)(
      { sender: {} },
      { workspaceId: "workspace-1", notificationId: "notification-1", streamId: "stream-1" }
    );
    expect(result).toEqual({ ok: true, data: { status: "busy" } });
    expect(mocks.claimWorkflowDecisionTurn).toHaveBeenCalledWith("workspace-1", "notification-1");
    expect(mocks.makeStreamChannel).not.toHaveBeenCalled();
  });
});

describe("Workflow Proposal decision wake dispatch", () => {
  it("sends only the Workspace invalidation payload", () => {
    vi.useFakeTimers();
    const sendToWorkspace = vi.fn();
    const dispatcher = new WorkflowProposalDecisionWakeDispatcher({ sendToWorkspace });
    dispatcher.notify("workspace-1");
    vi.advanceTimersByTime(40);
    expect(sendToWorkspace).toHaveBeenCalledWith(
      "workspace-1",
      AutomationWorkflowProposalDecisionChannels.wake,
      { workspaceId: "workspace-1" }
    );
    expect(sendToWorkspace.mock.calls[0]?.[2]).not.toHaveProperty("yaml");
    dispatcher.dispose();
  });

  it("binds both decision creation and decision service wake paths", () => {
    const cleanup = setupWorkflowProposalDecisionBroadcast(
      { sendToWorkspace: vi.fn() },
      { setWakeHandler: mocks.setWakeHandler },
      { setDecisionWakeHandler: mocks.setDecisionWakeHandler }
    );
    expect(mocks.setWakeHandler).toHaveBeenCalledWith(expect.any(Function));
    expect(mocks.setDecisionWakeHandler).toHaveBeenCalledWith(expect.any(Function));
    cleanup();
    expect(mocks.setWakeHandler).toHaveBeenLastCalledWith(null);
    expect(mocks.setDecisionWakeHandler).toHaveBeenLastCalledWith(null);
  });
});
