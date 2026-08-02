import { beforeEach, describe, expect, it, vi } from "vitest";
import { AutomationWorkspaceIntegrationChannels } from "@shared/ipc/automation/workspace-integration.channels";

const mocks = vi.hoisted(() => ({ ipcRenderer: { invoke: vi.fn() } }));

vi.mock("electron", () => ({ ipcRenderer: mocks.ipcRenderer }));

describe("preload workspaceIntegrationApi", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.ipcRenderer.invoke.mockResolvedValue({ ok: true, data: null });
  });

  it("forwards Workspace integration binding without repository paths", async () => {
    const { workspaceIntegrationApi } =
      await import("@preload/api/automation/workspace-integration");
    await workspaceIntegrationApi.getWorkspaceIntegration("workspace-a");
    await workspaceIntegrationApi.setWorkspaceIntegration("workspace-a", "source-control", [
      {
        providerId: "yunxiao",
        resourceType: "codeup-repo",
        resourceId: "repo-1",
        folderId: "folder-a",
      },
    ]);

    expect(mocks.ipcRenderer.invoke).toHaveBeenNthCalledWith(
      1,
      AutomationWorkspaceIntegrationChannels.get,
      { workspaceId: "workspace-a" }
    );
    expect(mocks.ipcRenderer.invoke).toHaveBeenNthCalledWith(
      2,
      AutomationWorkspaceIntegrationChannels.set,
      {
        workspaceId: "workspace-a",
        stage: "source-control",
        resources: [
          {
            providerId: "yunxiao",
            resourceType: "codeup-repo",
            resourceId: "repo-1",
            folderId: "folder-a",
          },
        ],
      }
    );
  });
});
