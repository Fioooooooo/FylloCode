import { BrowserWindow, dialog, ipcMain } from "electron";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import { WorkspaceWindowChannels as WindowChannels } from "@shared/ipc/workspace/window.channels";
import type { WorkspaceWindowManager } from "@main/bootstrap/workspace-window-manager";
import type { IpcResponse } from "@shared/types/ipc";
import type { WorkspaceInfo } from "@shared/types/workspace";

const mocks = vi.hoisted(() => ({
  getRequiredWorkspaceInfo: vi.fn(),
  resolveOrCreateFolderWorkspace: vi.fn(),
  touchWorkspaceLastOpened: vi.fn(),
}));

vi.mock("@main/services/workspace/workspace/workspace-service", () => ({
  getRequiredWorkspaceInfo: mocks.getRequiredWorkspaceInfo,
  resolveOrCreateFolderWorkspace: mocks.resolveOrCreateFolderWorkspace,
  touchWorkspaceLastOpened: mocks.touchWorkspaceLastOpened,
}));
vi.mock("@main/bootstrap/workspace-window-manager", () => ({
  workspaceWindowManager: {},
}));

function workspace(overrides: Partial<WorkspaceInfo> = {}): WorkspaceInfo {
  return {
    version: 2,
    id: "workspace-a",
    name: "Workspace A",
    kind: "folder",
    isDeleted: false,
    folderIds: ["workspace-a"],
    primaryFolderId: "workspace-a",
    createdAt: "2026-01-01T00:00:00.000Z",
    lastOpenedAt: "2026-01-02T00:00:00.000Z",
    primaryFolder: {
      version: 1,
      id: "workspace-a",
      name: "Workspace A",
      path: "/tmp/workspace-a",
    },
    primaryFolderMetaPath: "/tmp/app-data/workspace-folders/workspace-a/meta.json",
    pathMissing: false,
    folders: [
      {
        folderId: "workspace-a",
        folderName: "Workspace A",
        folderPath: "/tmp/workspace-a",
        pathMissing: false,
        isPrimary: true,
      },
    ],
    availableFolders: [
      {
        folderId: "workspace-a",
        folderName: "Workspace A",
        folderPath: "/tmp/workspace-a",
        pathMissing: false,
        isPrimary: true,
      },
    ],
    missingFolders: [],
    chatAvailable: true,
    ...overrides,
  };
}

function createManager(): WorkspaceWindowManager {
  return {
    getContextByWebContents: vi.fn(),
    openWorkspaceWindow: vi.fn(),
    openLauncherWindow: vi.fn(),
  } as unknown as WorkspaceWindowManager;
}

describe("registerWindowHandlers", () => {
  let manager: WorkspaceWindowManager;

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
      workspaceId: null,
    });

    const result = await handler(WindowChannels.getContext)({ sender }, undefined);

    expect(result).toEqual({
      ok: true,
      data: { windowId: 1, role: "launcher", workspaceId: null },
    });
    expect(manager.getContextByWebContents).toHaveBeenCalledWith(sender);
  });

  it("returns Workspace window context for a Workspace sender", async () => {
    const sender = { id: 11 };
    vi.mocked(manager.getContextByWebContents).mockReturnValue({
      windowId: 2,
      role: "workspace",
      workspaceId: "workspace-a",
    });

    const result = await handler(WindowChannels.getContext)({ sender }, undefined);

    expect(result).toEqual({
      ok: true,
      data: { windowId: 2, role: "workspace", workspaceId: "workspace-a" },
    });
    expect(manager.getContextByWebContents).toHaveBeenCalledWith(sender);
  });

  it("opens an existing Workspace window by focusing it", async () => {
    const sender = { id: 10 };
    const openedWorkspace = workspace({ lastOpenedAt: "2026-01-03T00:00:00.000Z" });
    mocks.getRequiredWorkspaceInfo.mockResolvedValue(workspace());
    mocks.touchWorkspaceLastOpened.mockResolvedValue(openedWorkspace);
    vi.mocked(manager.openWorkspaceWindow).mockReturnValue({
      status: "focused-existing",
      context: { windowId: 2, role: "workspace", workspaceId: "workspace-a" },
    });

    const result = await handler(WindowChannels.openWorkspace)(
      { sender },
      { workspaceId: "workspace-a" }
    );

    expect(result).toEqual({
      ok: true,
      data: {
        status: "focused-existing",
        context: { windowId: 2, role: "workspace", workspaceId: "workspace-a" },
      },
    });
    expect(mocks.getRequiredWorkspaceInfo).toHaveBeenCalledWith("workspace-a");
    expect(mocks.touchWorkspaceLastOpened).toHaveBeenCalledWith("workspace-a");
    expect(manager.openWorkspaceWindow).toHaveBeenCalledWith("workspace-a", sender);
  });

  it("does not create a Workspace window when the Workspace primary Folder path is missing", async () => {
    mocks.getRequiredWorkspaceInfo.mockResolvedValue(workspace({ pathMissing: true }));

    const result = await handler(WindowChannels.openWorkspace)(
      { sender: {} },
      { workspaceId: "workspace-a" }
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(IpcErrorCodes.WORKSPACE_PRIMARY_FOLDER_MISSING);
    }
    expect(manager.openWorkspaceWindow).not.toHaveBeenCalled();
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
    expect(mocks.resolveOrCreateFolderWorkspace).not.toHaveBeenCalled();
    expect(manager.openWorkspaceWindow).not.toHaveBeenCalled();
  });

  it("uses the sender window as open folder dialog parent and opens the resolved Folder Workspace", async () => {
    const parentWindow = { id: 1 } as unknown as BrowserWindow;
    const sender = { id: 10 };
    const adoptedWorkspace = workspace({
      id: "workspace-b",
      folderIds: ["workspace-b"],
      primaryFolderId: "workspace-b",
      primaryFolder: {
        version: 1,
        id: "workspace-b",
        name: "Workspace B",
        path: "/tmp/workspace-b",
      },
    });
    vi.mocked(BrowserWindow.fromWebContents).mockReturnValue(parentWindow);
    vi.mocked(dialog.showOpenDialog).mockResolvedValue({
      canceled: false,
      filePaths: ["/tmp/workspace-b"],
    });
    mocks.resolveOrCreateFolderWorkspace.mockResolvedValue(adoptedWorkspace);
    vi.mocked(manager.openWorkspaceWindow).mockReturnValue({
      status: "created",
      context: { windowId: 3, role: "workspace", workspaceId: "workspace-b" },
    });

    const result = await handler(WindowChannels.openFolder)({ sender }, undefined);

    expect(result).toEqual({
      ok: true,
      data: {
        status: "created",
        context: { windowId: 3, role: "workspace", workspaceId: "workspace-b" },
      },
    });
    expect(dialog.showOpenDialog).toHaveBeenCalledWith(parentWindow, {
      properties: ["openDirectory"],
    });
    expect(mocks.resolveOrCreateFolderWorkspace).toHaveBeenCalledWith("/tmp/workspace-b");
    expect(manager.openWorkspaceWindow).toHaveBeenCalledWith("workspace-b", sender);
  });
});
