import { beforeEach, describe, expect, it, vi } from "vitest";
import { ipcMain } from "electron";
import { AutomationWorkflowRunChannels } from "@shared/ipc/automation/workflow-run.channels";

const mocks = vi.hoisted(() => ({
  requireWorkspaceSender: vi.fn(),
  getRequiredWorkspaceInfo: vi.fn(),
  assertSessionBelongsToWorkspace: vi.fn(),
  listRuns: vi.fn(),
  getRunDetail: vi.fn(),
  decideRun: vi.fn(),
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
vi.mock("@main/services/automation/workflow/workflow-engine", () => ({
  workflowEngine: { setWakeHandler: mocks.setWakeHandler },
}));

import { registerWorkflowRunHandlers } from "@main/ipc/automation/workflow-run";

function handler(channel: string): (event: unknown, input: unknown) => Promise<unknown> {
  const call = vi.mocked(ipcMain.handle).mock.calls.find(([registered]) => registered === channel);
  expect(call).toBeTruthy();
  return call![1] as (event: unknown, input: unknown) => Promise<unknown>;
}

const engine = {
  listRuns: mocks.listRuns,
  getRunDetail: mocks.getRunDetail,
  decideRun: mocks.decideRun,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getRequiredWorkspaceInfo.mockResolvedValue({ id: "workspace-1" });
  mocks.assertSessionBelongsToWorkspace.mockResolvedValue(undefined);
  mocks.listRuns.mockResolvedValue({ runs: [] });
  mocks.getRunDetail.mockResolvedValue({ runId: "run-1" });
  mocks.decideRun.mockResolvedValue({ runId: "run-1", status: "running" });
  registerWorkflowRunHandlers(engine);
});

describe("Workflow Run IPC", () => {
  it("validates Workspace and parent ownership before listing", async () => {
    const sender = {};
    const input = { workspaceId: "workspace-1", parentSessionId: "parent-1" };
    const result = await handler(AutomationWorkflowRunChannels.list)({ sender }, input);

    expect(result).toEqual({ ok: true, data: { runs: [] } });
    expect(mocks.requireWorkspaceSender).toHaveBeenCalledWith(sender, "workspace-1");
    expect(mocks.getRequiredWorkspaceInfo).toHaveBeenCalledWith("workspace-1");
    expect(mocks.assertSessionBelongsToWorkspace).toHaveBeenCalledWith("workspace-1", "parent-1");
    expect(mocks.listRuns).toHaveBeenCalledWith(input);
  });

  it("does not query a Run when the parent owner is rejected", async () => {
    mocks.assertSessionBelongsToWorkspace.mockRejectedValueOnce(
      Object.assign(new Error("wrong parent"), { code: "SESSION_RESOURCE_UNAUTHORIZED" })
    );
    const result = await handler(AutomationWorkflowRunChannels.getDetail)(
      { sender: {} },
      { workspaceId: "workspace-1", parentSessionId: "other-parent", runId: "run-1" }
    );

    expect(result).toMatchObject({
      ok: false,
      error: { code: "SESSION_RESOURCE_UNAUTHORIZED" },
    });
    expect(mocks.getRunDetail).not.toHaveBeenCalled();
  });

  it("passes only the owner-qualified decision to the engine", async () => {
    const input = {
      workspaceId: "workspace-1",
      parentSessionId: "parent-1",
      runId: "run-1",
      decision: "approve",
    } as const;
    const result = await handler(AutomationWorkflowRunChannels.decide)({ sender: {} }, input);

    expect(result).toEqual({ ok: true, data: { runId: "run-1", status: "running" } });
    expect(mocks.decideRun).toHaveBeenCalledWith(input);
  });

  it("rejects legacy caller fields at the schema boundary", async () => {
    const result = await handler(AutomationWorkflowRunChannels.getDetail)(
      { sender: {} },
      {
        workspaceId: "workspace-1",
        parentSessionId: "parent-1",
        runId: "run-1",
        snapshotPath: "/tmp/run.json",
      }
    );

    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    expect(mocks.getRunDetail).not.toHaveBeenCalled();
  });
});
