import { ipcMain } from "electron";
import { getSpecsBrowserInputSchema } from "@shared/schemas/ipc/specs";
import { SpecsChannels } from "@shared/types/channels";
import { resolveProjectPath } from "@main/services/chat/chat-service";
import { getSpecsBrowser } from "@main/services/specs/specs-browser-service";
import { validate } from "./_kit/schema";
import { wrapHandler } from "./_kit/wrap-handler";

export function registerSpecsHandlers(): void {
  ipcMain.handle(SpecsChannels.getSpecsBrowser, (_event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(getSpecsBrowserInputSchema, input);
      const projectPath = await resolveProjectPath(form.projectId);
      return getSpecsBrowser(projectPath);
    })
  );
}
