import { ipcMain } from "electron";
import { getGuidelinesBrowserInputSchema } from "@shared/ipc/insight/guidelines.schemas";
import { InsightGuidelinesChannels } from "@shared/ipc/insight/guidelines.channels";
import { resolveWorkspace } from "@main/services/workspace/resolver/workspace-resolver";
import { getGuidelinesBrowser } from "@main/services/insight/guidelines/guidelines-browser-service";
import { validate } from "../_kit/schema";
import { wrapHandler } from "../_kit/wrap-handler";

export function registerGuidelinesHandlers(): void {
  ipcMain.handle(InsightGuidelinesChannels.getBrowser, (_event, input: unknown) =>
    wrapHandler(async () => {
      const { workspaceId } = validate(getGuidelinesBrowserInputSchema, input);
      return getGuidelinesBrowser((await resolveWorkspace(workspaceId)).cwd);
    })
  );
}
