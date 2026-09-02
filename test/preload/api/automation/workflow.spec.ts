import { beforeEach, describe, expect, it, vi } from "vitest";
import { AutomationWorkflowChannels } from "@shared/ipc/automation/workflow.channels";

const mocks = vi.hoisted(() => ({ ipcRenderer: { invoke: vi.fn() } }));

vi.mock("electron", () => ({ ipcRenderer: mocks.ipcRenderer }));

describe("preload workflowApi", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.ipcRenderer.invoke.mockResolvedValue({ ok: true, data: null });
  });

  it("forwards the v2 workspaceId/workflowId contract", async () => {
    const { workflowApi } = await import("@preload/api/automation/workflow");
    await workflowApi.list({ workspaceId: "workspace-a" });
    await workflowApi.save({
      workspaceId: "workspace-a",
      workflowId: "workflow-1",
      yaml: "name: Demo\nversion: 2",
    });
    await workflowApi.delete({ workspaceId: "workspace-a", workflowId: "workflow-1" });

    expect(mocks.ipcRenderer.invoke).toHaveBeenNthCalledWith(1, AutomationWorkflowChannels.list, {
      workspaceId: "workspace-a",
    });
    expect(mocks.ipcRenderer.invoke).toHaveBeenNthCalledWith(2, AutomationWorkflowChannels.save, {
      workspaceId: "workspace-a",
      workflowId: "workflow-1",
      yaml: "name: Demo\nversion: 2",
    });
    expect(mocks.ipcRenderer.invoke).toHaveBeenNthCalledWith(3, AutomationWorkflowChannels.delete, {
      workspaceId: "workspace-a",
      workflowId: "workflow-1",
    });
  });
});
