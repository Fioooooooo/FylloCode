import { ipcMain } from "electron";
import { getSpecsBrowserInputSchema } from "@shared/ipc/insight/specs.schemas";
import { InsightSpecsChannels } from "@shared/ipc/insight/specs.channels";
import { resolveWorkspace } from "@main/services/workspace/_public";
import { getSpecsBrowser } from "@main/services/insight/specs/specs-browser-service";
import { validate } from "../_kit/schema";
import { wrapHandler } from "../_kit/wrap-handler";
import { requireWorkspaceSender } from "../_kit/workspace-scope";

export function registerSpecsHandlers(): void {
  ipcMain.handle(InsightSpecsChannels.getSpecsBrowser, (event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(getSpecsBrowserInputSchema, input);
      requireWorkspaceSender(event.sender, form.workspaceId);
      return getSpecsBrowser(await resolveWorkspace(form.workspaceId));
    })
  );
}
