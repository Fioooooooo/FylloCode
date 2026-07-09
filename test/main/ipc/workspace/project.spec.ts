import { beforeEach, describe, expect, it, vi } from "vitest";
import { BrowserWindow, ipcMain } from "electron";
import { WorkspaceProjectChannels as ProjectChannels } from "@shared/ipc/workspace/project.channels";
import type { IpcResponse } from "@shared/types/ipc";

const mocks = vi.hoisted(() => ({
  adoptExistingFolder: vi.fn(),
  getProject: vi.fn(),
  listProjects: vi.fn(),
  removeProject: vi.fn(),
  updateProject: vi.fn(),
  cleanupProjectRuntime: vi.fn(),
  closeProjectWindow: vi.fn(),
  openLauncherWindow: vi.fn(),
}));

vi.mock("@main/services/workspace/project/project-service", () => ({
  adoptExistingFolder: mocks.adoptExistingFolder,
  getProject: mocks.getProject,
  listProjects: mocks.listProjects,
  removeProject: mocks.removeProject,
  updateProject: mocks.updateProject,
}));

vi.mock("@main/bootstrap/project-window-manager", () => ({
  projectWindowManager: {
    cleanupProjectRuntime: mocks.cleanupProjectRuntime,
    closeProjectWindow: mocks.closeProjectWindow,
    openLauncherWindow: mocks.openLauncherWindow,
  },
}));

const ORIGINAL_PLATFORM = process.platform;

describe("registerProjectHandlers", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    Object.defineProperty(process, "platform", { value: ORIGINAL_PLATFORM, configurable: true });
    vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([{} as BrowserWindow]);
    mocks.getProject.mockResolvedValue({
      id: "project-1",
      name: "Project",
      path: "/tmp/project",
      metaPath: "/tmp/meta.json",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      lastOpenedAt: new Date("2026-01-02T00:00:00.000Z"),
    });
    mocks.removeProject.mockResolvedValue(undefined);

    const { registerProjectHandlers } = await import("@main/ipc/workspace/project");
    registerProjectHandlers();
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

  it("cleans project runtime and closes its window before removing the project", async () => {
    const result = await handler(ProjectChannels.remove)({}, { id: "project-1" });

    expect(result).toEqual({ ok: true, data: undefined });
    expect(mocks.getProject).toHaveBeenCalledWith("project-1");
    expect(mocks.closeProjectWindow).toHaveBeenCalledWith("project-1", { cleanupRuntime: false });
    expect(mocks.cleanupProjectRuntime).toHaveBeenCalledWith("project-1", "/tmp/project");
    expect(mocks.removeProject).toHaveBeenCalledWith("project-1");
    expect(mocks.cleanupProjectRuntime.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.removeProject.mock.invocationCallOrder[0]
    );
    expect(mocks.closeProjectWindow.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.removeProject.mock.invocationCallOrder[0]
    );
  });

  it("opens launcher before removing the only window on non-macOS", async () => {
    Object.defineProperty(process, "platform", { value: "linux", configurable: true });
    vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([{} as BrowserWindow]);

    const result = await handler(ProjectChannels.remove)({}, { id: "project-1" });

    expect(result).toEqual({ ok: true, data: undefined });
    expect(mocks.openLauncherWindow).toHaveBeenCalledOnce();
    expect(mocks.openLauncherWindow.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.closeProjectWindow.mock.invocationCallOrder[0]
    );
  });

  it("does not open launcher before removing a project when another window exists", async () => {
    Object.defineProperty(process, "platform", { value: "linux", configurable: true });
    vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([
      {} as BrowserWindow,
      {} as BrowserWindow,
    ]);

    const result = await handler(ProjectChannels.remove)({}, { id: "project-1" });

    expect(result).toEqual({ ok: true, data: undefined });
    expect(mocks.openLauncherWindow).not.toHaveBeenCalled();
  });

  it("does not open launcher before removing the only window on macOS", async () => {
    Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
    vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([{} as BrowserWindow]);

    const result = await handler(ProjectChannels.remove)({}, { id: "project-1" });

    expect(result).toEqual({ ok: true, data: undefined });
    expect(mocks.openLauncherWindow).not.toHaveBeenCalled();
  });
});
