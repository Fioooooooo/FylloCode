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

  it("forwards explicit workspaceId for list, save, and delete", async () => {
    const { workflowApi } = await import("@preload/api/automation/workflow");
    await workflowApi.list({ workspaceId: "workspace-a" });
    await workflowApi.save({ workspaceId: "workspace-a", name: "custom", yaml: "stages: []" });
    await workflowApi.delete({ workspaceId: "workspace-a", name: "custom" });

    expect(mocks.ipcRenderer.invoke).toHaveBeenNthCalledWith(1, AutomationWorkflowChannels.list, {
      workspaceId: "workspace-a",
    });
    expect(mocks.ipcRenderer.invoke).toHaveBeenNthCalledWith(2, AutomationWorkflowChannels.save, {
      workspaceId: "workspace-a",
      name: "custom",
      yaml: "stages: []",
    });
    expect(mocks.ipcRenderer.invoke).toHaveBeenNthCalledWith(3, AutomationWorkflowChannels.delete, {
      workspaceId: "workspace-a",
      name: "custom",
    });
  });
});
