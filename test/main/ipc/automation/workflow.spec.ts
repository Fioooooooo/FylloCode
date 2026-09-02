import { beforeEach, describe, expect, it, vi } from "vitest";
import { ipcMain } from "electron";
import { AutomationWorkflowChannels } from "@shared/ipc/automation/workflow.channels";

const mocks = vi.hoisted(() => ({
  requireWorkspaceSender: vi.fn(),
  getRequiredWorkspaceInfo: vi.fn(),
  loadWorkflowDefinition: vi.fn(),
  listWorkflowDefinitions: vi.fn(),
  saveWorkflowDefinition: vi.fn(),
  deleteWorkflowDefinition: vi.fn(),
}));

vi.mock("@main/ipc/_kit/workspace-scope", () => ({
  requireWorkspaceSender: mocks.requireWorkspaceSender,
}));
vi.mock("@main/services/workspace/_public", () => ({
  getRequiredWorkspaceInfo: mocks.getRequiredWorkspaceInfo,
}));
vi.mock("@main/services/automation/workflow/workflow-service", () => ({
  loadWorkflowDefinition: mocks.loadWorkflowDefinition,
  listWorkflowDefinitions: mocks.listWorkflowDefinitions,
  saveWorkflowDefinition: mocks.saveWorkflowDefinition,
  deleteWorkflowDefinition: mocks.deleteWorkflowDefinition,
}));

import { registerWorkflowHandlers } from "@main/ipc/automation/workflow";

function handler(channel: string): (event: unknown, input: unknown) => Promise<unknown> {
  const call = vi.mocked(ipcMain.handle).mock.calls.find(([registered]) => registered === channel);
  expect(call).toBeTruthy();
  return call![1] as (event: unknown, input: unknown) => Promise<unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getRequiredWorkspaceInfo.mockResolvedValue({ id: "workspace-1" });
  mocks.loadWorkflowDefinition.mockResolvedValue({ workflowId: "workflow-1" });
  mocks.listWorkflowDefinitions.mockResolvedValue({ workflows: [] });
  mocks.saveWorkflowDefinition.mockResolvedValue({ workflowId: "workflow-1" });
  mocks.deleteWorkflowDefinition.mockResolvedValue(undefined);
  registerWorkflowHandlers();
});

describe("workflow definition IPC", () => {
  it("validates the Workspace sender before listing definitions", async () => {
    const sender = {};
    const result = await handler(AutomationWorkflowChannels.list)(
      { sender },
      { workspaceId: "workspace-1" }
    );

    expect(result).toEqual({ ok: true, data: { workflows: [] } });
    expect(mocks.requireWorkspaceSender).toHaveBeenCalledWith(sender, "workspace-1");
    expect(mocks.getRequiredWorkspaceInfo).toHaveBeenCalledWith("workspace-1");
    expect(mocks.listWorkflowDefinitions).toHaveBeenCalledWith("workspace-1");
  });

  it("checks existing workflow ownership before update and passes only the v2 request", async () => {
    const request = {
      workspaceId: "workspace-1",
      workflowId: "workflow-1",
      yaml: "name: Demo\nversion: 2\n",
    };
    const result = await handler(AutomationWorkflowChannels.save)({ sender: {} }, request);

    expect(result).toEqual({ ok: true, data: { workflowId: "workflow-1" } });
    expect(mocks.loadWorkflowDefinition).toHaveBeenCalledWith("workspace-1", "workflow-1");
    expect(mocks.saveWorkflowDefinition).toHaveBeenCalledWith(request);
  });

  it("does not call the definition service for an unowned workflow", async () => {
    mocks.loadWorkflowDefinition.mockResolvedValueOnce(null);
    const result = await handler(AutomationWorkflowChannels.delete)(
      { sender: {} },
      {
        workspaceId: "workspace-1",
        workflowId: "missing",
      }
    );

    expect(result).toMatchObject({ ok: false, error: { code: "WORKFLOW_NOT_FOUND" } });
    expect(mocks.deleteWorkflowDefinition).not.toHaveBeenCalled();
  });

  it("allows create without workflowId and rejects legacy name payloads at the schema boundary", async () => {
    const request = { workspaceId: "workspace-1", yaml: "name: New\nversion: 2\n" };
    await handler(AutomationWorkflowChannels.save)({ sender: {} }, request);
    expect(mocks.saveWorkflowDefinition).toHaveBeenCalledWith(request);

    const result = await handler(AutomationWorkflowChannels.save)(
      { sender: {} },
      {
        workspaceId: "workspace-1",
        name: "legacy-name",
        yaml: request.yaml,
      }
    );
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    expect(mocks.saveWorkflowDefinition).toHaveBeenCalledTimes(1);
  });
});
