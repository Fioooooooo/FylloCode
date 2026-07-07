import { BrowserWindow, dialog, ipcMain, type OpenDialogOptions } from "electron";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import { WindowChannels } from "@shared/types/channels";
import type {
  OpenFolderWindowResult,
  OpenLauncherWindowResult,
  OpenProjectWindowResult,
} from "@shared/types/window";
import {
  getContextInputSchema,
  openFolderInputSchema,
  openLauncherInputSchema,
  openProjectInputSchema,
} from "@shared/schemas/ipc/window";
import {
  projectWindowManager,
  type ProjectWindowManager,
} from "@main/bootstrap/project-window-manager";
import {
  adoptExistingFolder,
  getRequiredProject,
  touchProjectLastOpened,
} from "@main/services/project/project-service";
import { ipcError } from "./_kit/errors";
import { validate } from "./_kit/schema";
import { wrapHandler } from "./_kit/wrap-handler";

interface WindowHandlerDeps {
  manager?: ProjectWindowManager;
}

function assertProjectPathAvailable(project: {
  id: string;
  path: string;
  pathMissing?: boolean;
}): void {
  if (project.pathMissing) {
    throw ipcError(IpcErrorCodes.PROJECT_PATH_MISSING, `Project path is missing: ${project.path}`);
  }
}

export function registerWindowHandlers(deps: WindowHandlerDeps = {}): void {
  const manager = deps.manager ?? projectWindowManager;

  ipcMain.handle(WindowChannels.getContext, (event, input: unknown) =>
    wrapHandler(() => {
      validate(getContextInputSchema, input);
      const context = manager.getContextByWebContents(event.sender);
      if (!context) {
        throw ipcError(IpcErrorCodes.UNKNOWN_ERROR, "Window context not found");
      }
      return context;
    })
  );

  ipcMain.handle(WindowChannels.openProject, (event, input: unknown) =>
    wrapHandler(async (): Promise<OpenProjectWindowResult> => {
      const { projectId } = validate(openProjectInputSchema, input);
      const project = await getRequiredProject(projectId);
      assertProjectPathAvailable(project);

      const openedProject = await touchProjectLastOpened(project.id);
      const result = manager.openProjectWindow(openedProject.id, event.sender);

      return { ...result, project: openedProject };
    })
  );

  ipcMain.handle(WindowChannels.openFolder, (event, input: unknown) =>
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

      const project = await adoptExistingFolder(result.filePaths[0]);
      assertProjectPathAvailable(project);

      const openResult = manager.openProjectWindow(project.id, event.sender);
      return { ...openResult, project };
    })
  );

  ipcMain.handle(WindowChannels.openLauncher, (_event, input: unknown) =>
    wrapHandler((): OpenLauncherWindowResult => {
      validate(openLauncherInputSchema, input);
      return { context: manager.openLauncherWindow() };
    })
  );
}
