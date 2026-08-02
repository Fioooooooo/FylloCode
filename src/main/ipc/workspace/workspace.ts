import { BrowserWindow, ipcMain } from "electron";
import { workspaceWindowManager } from "@main/bootstrap/workspace-window-manager";
import {
  getWorkspaceInfo,
  listWorkspaceInfos,
  removeWorkspace,
  updateWorkspace,
} from "@main/services/workspace/workspace/workspace-service";
import { WorkspaceChannels } from "@shared/ipc/workspace/workspace.channels";
import {
  getByIdInputSchema,
  removeWorkspaceInputSchema,
  updateWorkspaceInputSchema,
} from "@shared/ipc/workspace/workspace.schemas";
import { validate } from "../_kit/schema";
import { wrapHandler } from "../_kit/wrap-handler";

export function registerWorkspaceHandlers(): void {
  ipcMain.handle(WorkspaceChannels.list, () => wrapHandler(() => listWorkspaceInfos()));

  ipcMain.handle(WorkspaceChannels.getById, (_event, input: unknown) =>
    wrapHandler(async () => {
      const { id } = validate(getByIdInputSchema, input);
      return getWorkspaceInfo(id);
    })
  );

  ipcMain.handle(WorkspaceChannels.update, (_event, input: unknown) =>
    wrapHandler(async () => updateWorkspace(validate(updateWorkspaceInputSchema, input)))
  );

  ipcMain.handle(WorkspaceChannels.remove, (_event, input: unknown) =>
    wrapHandler(async () => {
      const { id } = validate(removeWorkspaceInputSchema, input);
      if (process.platform !== "darwin" && BrowserWindow.getAllWindows().length <= 1) {
        workspaceWindowManager.openLauncherWindow();
      }
      workspaceWindowManager.closeWorkspaceWindow(id, { cleanupRuntime: false });
      await workspaceWindowManager.cleanupWorkspaceRuntime(id);
      await removeWorkspace(id);
    })
  );
}
