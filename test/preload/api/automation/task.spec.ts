import { beforeEach, describe, expect, it, vi } from "vitest";
import { AutomationTaskChannels } from "@shared/ipc/automation/task.channels";

const mocks = vi.hoisted(() => ({
  ipcRenderer: { invoke: vi.fn() },
}));

vi.mock("electron", () => ({ ipcRenderer: mocks.ipcRenderer }));

describe("preload taskApi", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.ipcRenderer.invoke.mockResolvedValue({ ok: true, data: null });
  });

  it("forwards workspaceId for local task operations", async () => {
    const { taskApi } = await import("@preload/api/automation/task");

    await taskApi.createTask("workspace-1", { title: "Task" });
    await taskApi.deleteTask("workspace-1", "task-1");

    expect(mocks.ipcRenderer.invoke).toHaveBeenNthCalledWith(1, AutomationTaskChannels.create, {
      workspaceId: "workspace-1",
      title: "Task",
    });
    expect(mocks.ipcRenderer.invoke).toHaveBeenNthCalledWith(2, AutomationTaskChannels.delete, {
      workspaceId: "workspace-1",
      taskId: "task-1",
    });
  });
});
