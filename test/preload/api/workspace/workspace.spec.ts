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

  it("exposes the complete Workspace lifecycle channel surface", async () => {
    const { workspaceApi } = await import("@preload/api/workspace/workspace");
    const definition = {
      name: "Collection",
      folderIds: ["folder-1"],
      primaryFolderId: "folder-1",
    };

    await workspaceApi.listDeleted();
    await workspaceApi.selectFolder();
    await workspaceApi.createCollection(definition);
    await workspaceApi.updateDefinition({ workspaceId: "workspace-1", name: "Renamed" });
    await workspaceApi.softDelete("workspace-1");
    await workspaceApi.restore("workspace-1");
    await workspaceApi.permanentlyDelete("workspace-1");
    await workspaceApi.relocateFolder("folder-1", true);

    expect(mocks.ipcRenderer.invoke.mock.calls).toEqual([
      [WorkspaceChannels.listDeleted],
      [WorkspaceChannels.selectFolder],
      [WorkspaceChannels.createCollection, definition],
      [WorkspaceChannels.updateDefinition, { workspaceId: "workspace-1", name: "Renamed" }],
      [WorkspaceChannels.softDelete, { workspaceId: "workspace-1" }],
      [WorkspaceChannels.restore, { workspaceId: "workspace-1" }],
      [WorkspaceChannels.permanentlyDelete, { workspaceId: "workspace-1" }],
      [WorkspaceChannels.relocateFolder, { folderId: "folder-1", confirmHistoricalSessions: true }],
    ]);
  });
});
