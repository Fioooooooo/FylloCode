import { BrowserWindow, dialog, ipcMain } from "electron";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import { WorkspaceWindowChannels as WindowChannels } from "@shared/ipc/workspace/window.channels";
import type { ProjectInfo } from "@shared/types/project";
import type { ProjectWindowManager } from "@main/bootstrap/project-window-manager";
import type { IpcResponse } from "@shared/types/ipc";

const mocks = vi.hoisted(() => ({
  adoptExistingFolder: vi.fn(),
  getRequiredProject: vi.fn(),
  touchProjectLastOpened: vi.fn(),
}));

vi.mock("@main/services/workspace/project/project-service", () => ({
  adoptExistingFolder: mocks.adoptExistingFolder,
  getRequiredProject: mocks.getRequiredProject,
  touchProjectLastOpened: mocks.touchProjectLastOpened,
}));

function project(overrides: Partial<ProjectInfo> = {}): ProjectInfo {
  return {
    id: "project-a",
    name: "Project A",
    path: "/tmp/project-a",
    metaPath: "/tmp/project-a/meta.json",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    lastOpenedAt: new Date("2026-01-02T00:00:00.000Z"),
    ...overrides,
  };
}

function createManager(): ProjectWindowManager {
  return {
    getContextByWebContents: vi.fn(),
    openProjectWindow: vi.fn(),
    openLauncherWindow: vi.fn(),
  } as unknown as ProjectWindowManager;
}

describe("registerWindowHandlers", () => {
  let manager: ProjectWindowManager;

  beforeEach(async () => {
    vi.clearAllMocks();
    manager = createManager();

    const { registerWindowHandlers } = await import("@main/ipc/workspace/window");
    registerWindowHandlers({ manager });
  });

  function handler(
    channel: string
  ): (event: { sender: unknown }, input: unknown) => Promise<IpcResponse<unknown>> {
    const call = vi
      .mocked(ipcMain.handle)
      .mock.calls.find(([registeredChannel]) => registeredChannel === channel);
    expect(call).toBeTruthy();
    return call![1] as (
      event: { sender: unknown },
      input: unknown
    ) => Promise<IpcResponse<unknown>>;
  }

  it("returns the sender window context", async () => {
    const sender = { id: 10 };
    vi.mocked(manager.getContextByWebContents).mockReturnValue({
      windowId: 1,
      role: "launcher",
      projectId: null,
    });

    const result = await handler(WindowChannels.getContext)({ sender }, undefined);

    expect(result).toEqual({
      ok: true,
      data: { windowId: 1, role: "launcher", projectId: null },
    });
    expect(manager.getContextByWebContents).toHaveBeenCalledWith(sender);
  });

  it("returns project window context for a project sender", async () => {
    const sender = { id: 11 };
    vi.mocked(manager.getContextByWebContents).mockReturnValue({
      windowId: 2,
      role: "project",
      projectId: "project-a",
    });

    const result = await handler(WindowChannels.getContext)({ sender }, undefined);

    expect(result).toEqual({
      ok: true,
      data: { windowId: 2, role: "project", projectId: "project-a" },
    });
    expect(manager.getContextByWebContents).toHaveBeenCalledWith(sender);
  });

  it("opens an existing project window by focusing it", async () => {
    const sender = { id: 10 };
    const openedProject = project({ lastOpenedAt: new Date("2026-01-03T00:00:00.000Z") });
    mocks.getRequiredProject.mockResolvedValue(project());
    mocks.touchProjectLastOpened.mockResolvedValue(openedProject);
    vi.mocked(manager.openProjectWindow).mockReturnValue({
      status: "focused-existing",
      context: { windowId: 2, role: "project", projectId: "project-a" },
    });

    const result = await handler(WindowChannels.openProject)(
      { sender },
      { projectId: "project-a" }
    );

    expect(result).toEqual({
      ok: true,
      data: {
        status: "focused-existing",
        context: { windowId: 2, role: "project", projectId: "project-a" },
        project: openedProject,
      },
    });
    expect(mocks.getRequiredProject).toHaveBeenCalledWith("project-a");
    expect(mocks.touchProjectLastOpened).toHaveBeenCalledWith("project-a");
    expect(manager.openProjectWindow).toHaveBeenCalledWith("project-a", sender);
  });

  it("does not create a project window when the project path is missing", async () => {
    mocks.getRequiredProject.mockResolvedValue(project({ pathMissing: true }));

    const result = await handler(WindowChannels.openProject)(
      { sender: {} },
      { projectId: "project-a" }
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(IpcErrorCodes.PROJECT_PATH_MISSING);
    }
    expect(manager.openProjectWindow).not.toHaveBeenCalled();
  });

  it("returns cancelled when open folder is cancelled", async () => {
    const parentWindow = { id: 1 } as unknown as BrowserWindow;
    const sender = { id: 10 };
    vi.mocked(BrowserWindow.fromWebContents).mockReturnValue(parentWindow);
    vi.mocked(dialog.showOpenDialog).mockResolvedValue({ canceled: true, filePaths: [] });

    const result = await handler(WindowChannels.openFolder)({ sender }, undefined);

    expect(result).toEqual({ ok: true, data: { status: "cancelled" } });
    expect(dialog.showOpenDialog).toHaveBeenCalledWith(parentWindow, {
      properties: ["openDirectory"],
    });
    expect(mocks.adoptExistingFolder).not.toHaveBeenCalled();
    expect(manager.openProjectWindow).not.toHaveBeenCalled();
  });

  it("uses the sender window as open folder dialog parent and opens the adopted project", async () => {
    const parentWindow = { id: 1 } as unknown as BrowserWindow;
    const sender = { id: 10 };
    const adoptedProject = project({ id: "project-b", path: "/tmp/project-b" });
    vi.mocked(BrowserWindow.fromWebContents).mockReturnValue(parentWindow);
    vi.mocked(dialog.showOpenDialog).mockResolvedValue({
      canceled: false,
      filePaths: ["/tmp/project-b"],
    });
    mocks.adoptExistingFolder.mockResolvedValue(adoptedProject);
    vi.mocked(manager.openProjectWindow).mockReturnValue({
      status: "created",
      context: { windowId: 3, role: "project", projectId: "project-b" },
    });

    const result = await handler(WindowChannels.openFolder)({ sender }, undefined);

    expect(result).toEqual({
      ok: true,
      data: {
        status: "created",
        context: { windowId: 3, role: "project", projectId: "project-b" },
        project: adoptedProject,
      },
    });
    expect(dialog.showOpenDialog).toHaveBeenCalledWith(parentWindow, {
      properties: ["openDirectory"],
    });
    expect(mocks.adoptExistingFolder).toHaveBeenCalledWith("/tmp/project-b");
    expect(manager.openProjectWindow).toHaveBeenCalledWith("project-b", sender);
  });
});
