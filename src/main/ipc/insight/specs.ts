import { ipcMain } from "electron";
import { getSpecsBrowserInputSchema } from "@shared/ipc/insight/specs.schemas";
import { InsightSpecsChannels } from "@shared/ipc/insight/specs.channels";
import { resolveProjectPath } from "@main/services/session/chat/chat-service";
import { getSpecsBrowser } from "@main/services/insight/specs/specs-browser-service";
import { validate } from "../_kit/schema";
import { wrapHandler } from "../_kit/wrap-handler";

export function registerSpecsHandlers(): void {
  ipcMain.handle(InsightSpecsChannels.getSpecsBrowser, (_event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(getSpecsBrowserInputSchema, input);
      const projectPath = await resolveProjectPath(form.projectId);
      return getSpecsBrowser(projectPath);
    })
  );
}
