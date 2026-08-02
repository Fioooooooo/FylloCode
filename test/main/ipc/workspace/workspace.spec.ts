import { beforeEach, describe, expect, it, vi } from "vitest";
import { BrowserWindow, ipcMain } from "electron";
import { WorkspaceChannels } from "@shared/ipc/workspace/workspace.channels";
import type { IpcResponse } from "@shared/types/ipc";

const mocks = vi.hoisted(() => ({
  getWorkspaceInfo: vi.fn(),
  listWorkspaceInfos: vi.fn(),
  removeWorkspace: vi.fn(),
  updateWorkspace: vi.fn(),
  cleanupWorkspaceRuntime: vi.fn(),
  closeWorkspaceWindow: vi.fn(),
  openLauncherWindow: vi.fn(),
}));

vi.mock("@main/services/workspace/workspace/workspace-service", () => ({
  getWorkspaceInfo: mocks.getWorkspaceInfo,
  listWorkspaceInfos: mocks.listWorkspaceInfos,
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

const ORIGINAL_PLATFORM = process.platform;

describe("registerWorkspaceHandlers", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    Object.defineProperty(process, "platform", { value: ORIGINAL_PLATFORM, configurable: true });
    vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([{} as BrowserWindow]);
    mocks.removeWorkspace.mockResolvedValue(undefined);

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
    mocks.listWorkspaceInfos.mockResolvedValue([{ id: "workspace-1" }]);
    mocks.getWorkspaceInfo.mockResolvedValue({ id: "workspace-1" });
    mocks.updateWorkspace.mockResolvedValue({ id: "workspace-1", name: "Renamed" });

    await expect(handler(WorkspaceChannels.list)({}, undefined)).resolves.toMatchObject({
      ok: true,
      data: [{ id: "workspace-1" }],
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
});
