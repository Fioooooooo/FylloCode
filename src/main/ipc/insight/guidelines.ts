import { ipcMain } from "electron";
import { getGuidelinesBrowserInputSchema } from "@shared/ipc/insight/guidelines.schemas";
import { InsightGuidelinesChannels } from "@shared/ipc/insight/guidelines.channels";
import { resolveWorkspace } from "@main/services/workspace/resolver/workspace-resolver";
import { getGuidelinesBrowser } from "@main/services/insight/guidelines/guidelines-browser-service";
import { validate } from "../_kit/schema";
import { wrapHandler } from "../_kit/wrap-handler";
import { requireWorkspaceSender } from "../_kit/workspace-scope";

export function registerGuidelinesHandlers(): void {
  ipcMain.handle(InsightGuidelinesChannels.getBrowser, (event, input: unknown) =>
    wrapHandler(async () => {
      const { workspaceId } = validate(getGuidelinesBrowserInputSchema, input);
      requireWorkspaceSender(event.sender, workspaceId);
      return getGuidelinesBrowser(await resolveWorkspace(workspaceId));
    })
  );
}
