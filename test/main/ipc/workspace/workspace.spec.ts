import { beforeEach, describe, expect, it, vi } from "vitest";
import { BrowserWindow, ipcMain } from "electron";
import { WorkspaceChannels } from "@shared/ipc/workspace/workspace.channels";
import type { IpcResponse } from "@shared/types/ipc";

const mocks = vi.hoisted(() => ({
  getWorkspaceInfo: vi.fn(),
  listWorkspaceLauncherItems: vi.fn(),
  listDeletedWorkspaceLauncherItems: vi.fn(),
  removeWorkspace: vi.fn(),
  updateWorkspace: vi.fn(),
  cleanupWorkspaceRuntime: vi.fn(),
  closeWorkspaceWindow: vi.fn(),
  openLauncherWindow: vi.fn(),
  createCollectionWorkspace: vi.fn(),
  updateWorkspaceDefinition: vi.fn(),
  softDeleteWorkspace: vi.fn(),
  restoreWorkspace: vi.fn(),
  permanentlyDeleteWorkspace: vi.fn(),
}));

vi.mock("@main/services/workspace/workspace/workspace-service", () => ({
  getWorkspaceInfo: mocks.getWorkspaceInfo,
  listWorkspaceLauncherItems: mocks.listWorkspaceLauncherItems,
  listDeletedWorkspaceLauncherItems: mocks.listDeletedWorkspaceLauncherItems,
  removeWorkspace: mocks.removeWorkspace,
  updateWorkspace: mocks.updateWorkspace,
}));

vi.mock("@main/bootstrap/workspace-window-manager", () => ({
  workspaceWindowManager: {
    cleanupWorkspaceRuntime: mocks.cleanupWorkspaceRuntime,
    closeWorkspaceWindow: mocks.closeWorkspaceWindow,
    openLauncherWindow: mocks.openLauncherWindow,
  },
}));
vi.mock("@main/services/workspace/workspace/workspace-lifecycle-service", () => ({
  createCollectionWorkspace: mocks.createCollectionWorkspace,
  updateWorkspaceDefinition: mocks.updateWorkspaceDefinition,
  softDeleteWorkspace: mocks.softDeleteWorkspace,
  restoreWorkspace: mocks.restoreWorkspace,
}));
vi.mock("@main/services/workspace/workspace/workspace-cleanup-service", () => ({
  permanentlyDeleteWorkspace: mocks.permanentlyDeleteWorkspace,
}));

const ORIGINAL_PLATFORM = process.platform;

describe("registerWorkspaceHandlers", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    Object.defineProperty(process, "platform", { value: ORIGINAL_PLATFORM, configurable: true });
    vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([{} as BrowserWindow]);
    mocks.removeWorkspace.mockResolvedValue(undefined);
    mocks.cleanupWorkspaceRuntime.mockReset().mockResolvedValue(undefined);
    mocks.softDeleteWorkspace.mockResolvedValue(undefined);
    mocks.permanentlyDeleteWorkspace.mockResolvedValue(undefined);

    const { registerWorkspaceHandlers } = await import("@main/ipc/workspace/workspace");
    registerWorkspaceHandlers();
  });

  function handler(
    channel: string
  ): (event: unknown, input: unknown) => Promise<IpcResponse<unknown>> {
    const call = vi
      .mocked(ipcMain.handle)
      .mock.calls.find(([registeredChannel]) => registeredChannel === channel);
    expect(call).toBeTruthy();
    return call![1] as (event: unknown, input: unknown) => Promise<IpcResponse<unknown>>;
  }

  it("routes list, get, and update through Workspace-only schemas", async () => {
    mocks.listWorkspaceLauncherItems.mockResolvedValue([{ workspaceId: "workspace-1" }]);
    mocks.getWorkspaceInfo.mockResolvedValue({ id: "workspace-1" });
    mocks.updateWorkspace.mockResolvedValue({ id: "workspace-1", name: "Renamed" });

    await expect(handler(WorkspaceChannels.list)({}, undefined)).resolves.toMatchObject({
      ok: true,
      data: [{ workspaceId: "workspace-1" }],
    });
    await expect(
      handler(WorkspaceChannels.getById)({}, { id: "workspace-1" })
    ).resolves.toMatchObject({ ok: true, data: { id: "workspace-1" } });
    await expect(
      handler(WorkspaceChannels.update)({}, { id: "workspace-1", patch: { name: "Renamed" } })
    ).resolves.toMatchObject({ ok: true, data: { name: "Renamed" } });
    expect(mocks.updateWorkspace).toHaveBeenCalledWith({
      id: "workspace-1",
      patch: { name: "Renamed" },
    });
  });

  it("cleans Workspace runtime and closes its window before soft deletion", async () => {
    const result = await handler(WorkspaceChannels.remove)({}, { id: "workspace-1" });

    expect(result).toEqual({ ok: true, data: undefined });
    expect(mocks.closeWorkspaceWindow).toHaveBeenCalledWith("workspace-1", {
      cleanupRuntime: false,
    });
    expect(mocks.cleanupWorkspaceRuntime).toHaveBeenCalledWith("workspace-1");
    expect(mocks.removeWorkspace).toHaveBeenCalledWith("workspace-1");
    expect(mocks.cleanupWorkspaceRuntime.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.removeWorkspace.mock.invocationCallOrder[0]
    );
    expect(mocks.closeWorkspaceWindow.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.removeWorkspace.mock.invocationCallOrder[0]
    );
  });

  it("opens launcher before removing the only window on non-macOS", async () => {
    Object.defineProperty(process, "platform", { value: "linux", configurable: true });

    const result = await handler(WorkspaceChannels.remove)({}, { id: "workspace-1" });

    expect(result).toEqual({ ok: true, data: undefined });
    expect(mocks.openLauncherWindow).toHaveBeenCalledOnce();
    expect(mocks.openLauncherWindow.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.closeWorkspaceWindow.mock.invocationCallOrder[0]
    );
  });

  it("keeps another Workspace window open without creating a launcher", async () => {
    Object.defineProperty(process, "platform", { value: "linux", configurable: true });
    vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([
      {} as BrowserWindow,
      {} as BrowserWindow,
    ]);

    await handler(WorkspaceChannels.remove)({}, { id: "workspace-1" });

    expect(mocks.openLauncherWindow).not.toHaveBeenCalled();
  });

  it("cleans runtime before soft delete and does not tombstone on cleanup failure", async () => {
    const softDeleteHandler = handler(WorkspaceChannels.softDelete);
    await softDeleteHandler({}, { workspaceId: "workspace-1" });
    expect(mocks.closeWorkspaceWindow).toHaveBeenCalledWith("workspace-1", {
      cleanupRuntime: false,
    });
    expect(mocks.cleanupWorkspaceRuntime.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.softDeleteWorkspace.mock.invocationCallOrder[0]
    );

    mocks.softDeleteWorkspace.mockClear();
    mocks.cleanupWorkspaceRuntime.mockRejectedValueOnce(new Error("busy"));
    await expect(softDeleteHandler({}, { workspaceId: "workspace-1" })).resolves.toMatchObject({
      ok: false,
    });
    expect(mocks.softDeleteWorkspace).not.toHaveBeenCalled();
  });

  it("routes Collection create/update and permanent cleanup through services", async () => {
    mocks.createCollectionWorkspace.mockResolvedValue({ id: "collection-1" });
    mocks.updateWorkspaceDefinition.mockResolvedValue({ id: "collection-1", name: "Renamed" });

    await handler(WorkspaceChannels.createCollection)(
      {},
      {
        name: "Collection",
        folderIds: ["folder-1"],
        primaryFolderId: "folder-1",
      }
    );
    await handler(WorkspaceChannels.updateDefinition)(
      {},
      {
        workspaceId: "collection-1",
        name: "Renamed",
      }
    );
    await handler(WorkspaceChannels.permanentlyDelete)({}, { workspaceId: "collection-1" });

    expect(mocks.createCollectionWorkspace).toHaveBeenCalledOnce();
    expect(mocks.updateWorkspaceDefinition).toHaveBeenCalledOnce();
    expect(mocks.permanentlyDeleteWorkspace).toHaveBeenCalledWith("collection-1");
  });
});
