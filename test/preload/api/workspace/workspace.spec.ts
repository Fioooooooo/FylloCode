import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceChannels } from "@shared/ipc/workspace/workspace.channels";

const mocks = vi.hoisted(() => ({
  ipcRenderer: { invoke: vi.fn() },
}));

vi.mock("electron", () => ({ ipcRenderer: mocks.ipcRenderer }));

describe("preload workspaceApi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ipcRenderer.invoke.mockResolvedValue({ ok: true, data: null });
  });

  it("uses Workspace-only list, get, update, and remove channels", async () => {
    const { workspaceApi } = await import("@preload/api/workspace/workspace");

    await workspaceApi.list();
    await workspaceApi.getById("workspace-1");
    await workspaceApi.update("workspace-1", { name: "Renamed", healthScore: 90 });
    await workspaceApi.remove("workspace-1");

    expect(mocks.ipcRenderer.invoke.mock.calls).toEqual([
      [WorkspaceChannels.list],
      [WorkspaceChannels.getById, { id: "workspace-1" }],
      [
        WorkspaceChannels.update,
        { id: "workspace-1", patch: { name: "Renamed", healthScore: 90 } },
      ],
      [WorkspaceChannels.remove, { id: "workspace-1" }],
    ]);
  });
});
