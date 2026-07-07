import { ipcMain, dialog, BrowserWindow } from "electron";
import { ProjectChannels } from "@shared/types/channels";
import {
  getByIdInputSchema,
  removeProjectInputSchema,
  updateProjectInputSchema,
} from "@shared/schemas/ipc/project";
import { wrapHandler } from "./_kit/wrap-handler";
import { validate } from "./_kit/schema";
import {
  adoptExistingFolder,
  getProject,
  listProjects,
  removeProject,
  updateProject,
} from "@main/services/project/project-service";
import { projectWindowManager } from "@main/bootstrap/project-window-manager";

export function registerProjectHandlers(): void {
  ipcMain.handle(ProjectChannels.list, () => wrapHandler(() => listProjects()));

  ipcMain.handle(ProjectChannels.getById, (_event, input: unknown) =>
    wrapHandler(async () => {
      const { id } = validate(getByIdInputSchema, input);
      return getProject(id);
    })
  );

  ipcMain.handle(ProjectChannels.update, (_event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(updateProjectInputSchema, input);
      return updateProject(form);
    })
  );

  ipcMain.handle(ProjectChannels.remove, (_event, input: unknown) =>
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

  ipcMain.handle(ProjectChannels.openFolder, () =>
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
