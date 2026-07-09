import { ipcMain, dialog, BrowserWindow } from "electron";
import { WorkspaceProjectChannels } from "@shared/ipc/workspace/project.channels";
import {
  getByIdInputSchema,
  removeProjectInputSchema,
  updateProjectInputSchema,
} from "@shared/ipc/workspace/project.schemas";
import { wrapHandler } from "../_kit/wrap-handler";
import { validate } from "../_kit/schema";
import {
  adoptExistingFolder,
  getProject,
  listProjects,
  removeProject,
  updateProject,
} from "@main/services/workspace/project/project-service";
import { projectWindowManager } from "@main/bootstrap/project-window-manager";

export function registerProjectHandlers(): void {
  ipcMain.handle(WorkspaceProjectChannels.list, () => wrapHandler(() => listProjects()));

  ipcMain.handle(WorkspaceProjectChannels.getById, (_event, input: unknown) =>
    wrapHandler(async () => {
      const { id } = validate(getByIdInputSchema, input);
      return getProject(id);
    })
  );

  ipcMain.handle(WorkspaceProjectChannels.update, (_event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(updateProjectInputSchema, input);
      return updateProject(form);
    })
  );

  ipcMain.handle(WorkspaceProjectChannels.remove, (_event, input: unknown) =>
    wrapHandler(async () => {
      const { id } = validate(removeProjectInputSchema, input);
      const project = await getProject(id);
      if (process.platform !== "darwin" && BrowserWindow.getAllWindows().length <= 1) {
        projectWindowManager.openLauncherWindow();
      }
      projectWindowManager.closeProjectWindow(id, { cleanupRuntime: false });
      await projectWindowManager.cleanupProjectRuntime(id, project?.path);
      await removeProject(id);
    })
  );

  ipcMain.handle(WorkspaceProjectChannels.openFolder, () =>
    wrapHandler(async () => {
      const result = await dialog.showOpenDialog({
        properties: ["openDirectory"],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return null;
      }

      return adoptExistingFolder(result.filePaths[0]);
    })
  );
}
