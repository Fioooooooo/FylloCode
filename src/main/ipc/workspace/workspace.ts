import { BrowserWindow, ipcMain } from "electron";
import { dialog, type OpenDialogOptions } from "electron";
import { workspaceWindowManager } from "@main/bootstrap/workspace-window-manager";
import {
  getWorkspaceInfo,
  listDeletedWorkspaceLauncherItems,
  listWorkspaceLauncherItems,
  removeWorkspace,
  updateWorkspace,
} from "@main/services/workspace/workspace/workspace-service";
import {
  createCollectionWorkspace,
  restoreWorkspace,
  softDeleteWorkspace,
  updateWorkspaceDefinition,
} from "@main/services/workspace/workspace/workspace-lifecycle-service";
import { permanentlyDeleteWorkspace } from "@main/services/workspace/workspace/workspace-cleanup-service";
import { folderRegistryService } from "@main/services/workspace/folder/folder-registry-service";
import { WorkspaceChannels } from "@shared/ipc/workspace/workspace.channels";
import {
  getByIdInputSchema,
  createCollectionWorkspaceInputSchema,
  relocateFolderInputSchema,
  removeWorkspaceInputSchema,
  selectWorkspaceFolderInputSchema,
  updateWorkspaceInputSchema,
  updateWorkspaceDefinitionInputSchema,
  workspaceLifecycleIdInputSchema,
} from "@shared/ipc/workspace/workspace.schemas";
import { validate } from "../_kit/schema";
import { wrapHandler } from "../_kit/wrap-handler";

export function registerWorkspaceHandlers(): void {
  ipcMain.handle(WorkspaceChannels.list, () => wrapHandler(() => listWorkspaceLauncherItems()));

  ipcMain.handle(WorkspaceChannels.listDeleted, () =>
    wrapHandler(() => listDeletedWorkspaceLauncherItems())
  );

  ipcMain.handle(WorkspaceChannels.getById, (_event, input: unknown) =>
    wrapHandler(async () => {
      const { id } = validate(getByIdInputSchema, input);
      return getWorkspaceInfo(id);
    })
  );

  ipcMain.handle(WorkspaceChannels.update, (_event, input: unknown) =>
    wrapHandler(async () => updateWorkspace(validate(updateWorkspaceInputSchema, input)))
  );

  ipcMain.handle(WorkspaceChannels.selectFolder, (event, input: unknown) =>
    wrapHandler(async () => {
      validate(selectWorkspaceFolderInputSchema, input);
      const parentWindow = BrowserWindow.fromWebContents(event.sender);
      const options: OpenDialogOptions = { properties: ["openDirectory"] };
      const result = parentWindow
        ? await dialog.showOpenDialog(parentWindow, options)
        : await dialog.showOpenDialog(options);
      if (result.canceled || result.filePaths.length === 0) return null;
      return folderRegistryService.resolveOrCreateFolder(result.filePaths[0]);
    })
  );

  ipcMain.handle(WorkspaceChannels.createCollection, (_event, input: unknown) =>
    wrapHandler(() =>
      createCollectionWorkspace(validate(createCollectionWorkspaceInputSchema, input))
    )
  );

  ipcMain.handle(WorkspaceChannels.updateDefinition, (_event, input: unknown) =>
    wrapHandler(() =>
      updateWorkspaceDefinition(validate(updateWorkspaceDefinitionInputSchema, input))
    )
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

  ipcMain.handle(WorkspaceChannels.softDelete, (_event, input: unknown) =>
    wrapHandler(async () => {
      const { workspaceId } = validate(workspaceLifecycleIdInputSchema, input);
      if (process.platform !== "darwin" && BrowserWindow.getAllWindows().length <= 1) {
        workspaceWindowManager.openLauncherWindow();
      }
      workspaceWindowManager.closeWorkspaceWindow(workspaceId, { cleanupRuntime: false });
      await workspaceWindowManager.cleanupWorkspaceRuntime(workspaceId);
      await softDeleteWorkspace(workspaceId, { runtimeStopped: true });
    })
  );

  ipcMain.handle(WorkspaceChannels.restore, (_event, input: unknown) =>
    wrapHandler(() => {
      const { workspaceId } = validate(workspaceLifecycleIdInputSchema, input);
      return restoreWorkspace(workspaceId);
    })
  );

  ipcMain.handle(WorkspaceChannels.permanentlyDelete, (_event, input: unknown) =>
    wrapHandler(async () => {
      const { workspaceId } = validate(workspaceLifecycleIdInputSchema, input);
      workspaceWindowManager.closeWorkspaceWindow(workspaceId, { cleanupRuntime: false });
      await workspaceWindowManager.cleanupWorkspaceRuntime(workspaceId);
      await permanentlyDeleteWorkspace(workspaceId);
    })
  );

  ipcMain.handle(WorkspaceChannels.relocateFolder, (event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(relocateFolderInputSchema, input);
      const parentWindow = BrowserWindow.fromWebContents(event.sender);
      const options: OpenDialogOptions = { properties: ["openDirectory"] };
      const result = parentWindow
        ? await dialog.showOpenDialog(parentWindow, options)
        : await dialog.showOpenDialog(options);
      if (result.canceled || result.filePaths.length === 0) return null;
      return folderRegistryService.relocateFolder(form.folderId, result.filePaths[0], {
        confirmHistoricalSessions: form.confirmHistoricalSessions,
      });
    })
  );
}
