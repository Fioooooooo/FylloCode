import { ipcMain } from "electron";
import { getGuidelinesBrowserInputSchema } from "@shared/schemas/ipc/guidelines";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import { GuidelinesChannels } from "@shared/types/channels";
import { loadProject } from "@main/infra/storage/project-store";
import { getGuidelinesBrowser } from "@main/services/guidelines/guidelines-browser-service";
import { validate } from "./_kit/schema";
import { ipcError } from "./_kit/errors";
import { wrapHandler } from "./_kit/wrap-handler";

export function registerGuidelinesHandlers(): void {
  ipcMain.handle(GuidelinesChannels.getBrowser, (_event, input: unknown) =>
    wrapHandler(async () => {
      const { projectId } = validate(getGuidelinesBrowserInputSchema, input);
      const project = await loadProject(projectId);
      if (!project) {
        throw ipcError(IpcErrorCodes.PROJECT_NOT_FOUND, `Project not found: ${projectId}`);
      }

      return getGuidelinesBrowser(project.path);
    })
  );
}
