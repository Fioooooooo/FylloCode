import { ipcMain } from "electron";
import { getProjectOverviewInputSchema } from "@shared/ipc/insight/overview.schemas";
import { InsightOverviewChannels } from "@shared/ipc/insight/overview.channels";
import { getProjectOverview } from "@main/services/insight/overview/overview-service";
import { validate } from "../_kit/schema";
import { wrapHandler } from "../_kit/wrap-handler";
import { requireWorkspaceSender } from "../_kit/workspace-scope";

export function registerOverviewHandlers(): void {
  ipcMain.handle(InsightOverviewChannels.getProjectOverview, (event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(getProjectOverviewInputSchema, input);
      requireWorkspaceSender(event.sender, form.workspaceId);
      return getProjectOverview(form.workspaceId);
    })
  );
}
