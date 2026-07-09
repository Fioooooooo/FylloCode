import { ipcMain } from "electron";
import { getProjectOverviewInputSchema } from "@shared/ipc/insight/overview.schemas";
import { InsightOverviewChannels } from "@shared/ipc/insight/overview.channels";
import { resolveProjectPath } from "@main/services/session/chat/chat-service";
import { getProjectOverview } from "@main/services/insight/overview/overview-service";
import { validate } from "../_kit/schema";
import { wrapHandler } from "../_kit/wrap-handler";

export function registerOverviewHandlers(): void {
  ipcMain.handle(InsightOverviewChannels.getProjectOverview, (_event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(getProjectOverviewInputSchema, input);
      const projectPath = await resolveProjectPath(form.projectId);
      return getProjectOverview(projectPath);
    })
  );
}
