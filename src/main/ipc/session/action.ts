import { ipcMain } from "electron";
import { SessionActionChannels } from "@shared/ipc/session/action.channels";
import {
  registerActionInputSchema,
  transitionActionInputSchema,
  transitionActionsInputSchema,
} from "@shared/ipc/session/action.schemas";
import { validate } from "@main/ipc/_kit/schema";
import { wrapHandler } from "@main/ipc/_kit/wrap-handler";
import { projectWindowManager } from "@main/bootstrap/project-window-manager";
import { ipcError } from "@main/ipc/_kit/errors";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import {
  registerAction,
  transitionAction,
  transitionActions,
} from "@main/services/session/action/action-service";

function validateSenderProject(senderWebContents: Electron.WebContents, projectId: string): void {
  const context = projectWindowManager.getContextByWebContents(senderWebContents);
  if (!context || context.role !== "project" || context.projectId !== projectId) {
    throw ipcError(
      IpcErrorCodes.PROJECT_NOT_FOUND,
      "Sender window does not belong to the specified project"
    );
  }
}

export function registerSessionActionHandlers(): void {
  ipcMain.handle(SessionActionChannels.registerAction, (event, input: unknown) =>
    wrapHandler(async () => {
      const data = validate(registerActionInputSchema, input);
      validateSenderProject(event.sender, data.projectId);
      return registerAction(data);
    })
  );

  ipcMain.handle(SessionActionChannels.transitionAction, (event, input: unknown) =>
    wrapHandler(async () => {
      const data = validate(transitionActionInputSchema, input);
      validateSenderProject(event.sender, data.projectId);
      return transitionAction(data);
    })
  );

  ipcMain.handle(SessionActionChannels.transitionActions, (event, input: unknown) =>
    wrapHandler(async () => {
      const data = validate(transitionActionsInputSchema, input);
      validateSenderProject(event.sender, data.projectId);
      return transitionActions(data);
    })
  );
}
