import { ipcMain } from "electron";
import { SessionActionChannels } from "@shared/ipc/session/action.channels";
import {
  registerActionInputSchema,
  transitionActionInputSchema,
  transitionActionsInputSchema,
} from "@shared/ipc/session/action.schemas";
import { validate } from "@main/ipc/_kit/schema";
import { wrapHandler } from "@main/ipc/_kit/wrap-handler";
import { requireWorkspaceSender } from "@main/ipc/_kit/workspace-scope";
import {
  registerAction,
  transitionAction,
  transitionActions,
} from "@main/services/session/action/action-service";

export function registerSessionActionHandlers(): void {
  ipcMain.handle(SessionActionChannels.registerAction, (event, input: unknown) =>
    wrapHandler(async () => {
      const data = validate(registerActionInputSchema, input);
      requireWorkspaceSender(event.sender, data.workspaceId);
      return registerAction(data);
    })
  );

  ipcMain.handle(SessionActionChannels.transitionAction, (event, input: unknown) =>
    wrapHandler(async () => {
      const data = validate(transitionActionInputSchema, input);
      requireWorkspaceSender(event.sender, data.workspaceId);
      return transitionAction(data);
    })
  );

  ipcMain.handle(SessionActionChannels.transitionActions, (event, input: unknown) =>
    wrapHandler(async () => {
      const data = validate(transitionActionsInputSchema, input);
      requireWorkspaceSender(event.sender, data.workspaceId);
      return transitionActions(data);
    })
  );
}
