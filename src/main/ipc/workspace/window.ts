import { BrowserWindow, dialog, ipcMain, type OpenDialogOptions } from "electron";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import { WorkspaceWindowChannels } from "@shared/ipc/workspace/window.channels";
import type {
  OpenFolderWindowResult,
  OpenLauncherWindowResult,
  OpenWorkspaceWindowResult,
} from "@shared/types/window";
import {
  getContextInputSchema,
  openFolderInputSchema,
  openLauncherInputSchema,
  openWorkspaceInputSchema,
} from "@shared/ipc/workspace/window.schemas";
import {
  workspaceWindowManager,
  type WorkspaceWindowManager,
} from "@main/bootstrap/workspace-window-manager";
import {
  getRequiredWorkspaceInfo,
  resolveOrCreateFolderWorkspace,
  touchWorkspaceLastOpened,
} from "@main/services/workspace/workspace/workspace-service";
import type { WorkspaceInfo } from "@shared/types/workspace";
import { ipcError } from "../_kit/errors";
import { validate } from "../_kit/schema";
import { wrapHandler } from "../_kit/wrap-handler";

interface WindowHandlerDeps {
  manager?: WorkspaceWindowManager;
}

function assertWorkspacePrimaryAvailable(workspace: WorkspaceInfo): void {
  if (workspace.pathMissing) {
    throw ipcError(
      IpcErrorCodes.WORKSPACE_PRIMARY_FOLDER_MISSING,
      `Workspace primary Folder path is missing: ${workspace.primaryFolder.path}`
    );
  }
}

export function registerWindowHandlers(deps: WindowHandlerDeps = {}): void {
  const manager = deps.manager ?? workspaceWindowManager;

  ipcMain.handle(WorkspaceWindowChannels.getContext, (event, input: unknown) =>
    wrapHandler(() => {
      validate(getContextInputSchema, input);
      const context = manager.getContextByWebContents(event.sender);
      if (!context) {
        throw ipcError(IpcErrorCodes.UNKNOWN_ERROR, "Window context not found");
      }
      return context;
    })
  );

  ipcMain.handle(WorkspaceWindowChannels.openWorkspace, (event, input: unknown) =>
    wrapHandler(async (): Promise<OpenWorkspaceWindowResult> => {
      const { workspaceId } = validate(openWorkspaceInputSchema, input);
      const workspace = await getRequiredWorkspaceInfo(workspaceId);
      assertWorkspacePrimaryAvailable(workspace);

      const openedWorkspace = await touchWorkspaceLastOpened(workspace.id);
      const result = manager.openWorkspaceWindow(openedWorkspace.id, event.sender);

      return result;
    })
  );

  ipcMain.handle(WorkspaceWindowChannels.openFolder, (event, input: unknown) =>
    wrapHandler(async (): Promise<OpenFolderWindowResult> => {
      validate(openFolderInputSchema, input);

      const parentWindow = BrowserWindow.fromWebContents(event.sender);
      const dialogOptions: OpenDialogOptions = { properties: ["openDirectory"] };
      const result = parentWindow
        ? await dialog.showOpenDialog(parentWindow, dialogOptions)
        : await dialog.showOpenDialog(dialogOptions);

      if (result.canceled || result.filePaths.length === 0) {
        return { status: "cancelled" };
      }

      const workspace = await resolveOrCreateFolderWorkspace(result.filePaths[0]);
      assertWorkspacePrimaryAvailable(workspace);

      const openResult = manager.openWorkspaceWindow(workspace.id, event.sender);
      return openResult;
    })
  );

  ipcMain.handle(WorkspaceWindowChannels.openLauncher, (_event, input: unknown) =>
    wrapHandler((): OpenLauncherWindowResult => {
      validate(openLauncherInputSchema, input);
      return { context: manager.openLauncherWindow() };
    })
  );
}
