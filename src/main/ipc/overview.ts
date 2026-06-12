import { ipcMain } from "electron";
import { getProjectOverviewInputSchema } from "@shared/schemas/ipc/overview";
import { OverviewChannels } from "@shared/types/channels";
import { resolveProjectPath } from "@main/services/chat/chat-service";
import { getProjectOverview } from "@main/services/overview/overview-service";
import { validate } from "./_kit/schema";
import { wrapHandler } from "./_kit/wrap-handler";

export function registerOverviewHandlers(): void {
  ipcMain.handle(OverviewChannels.getProjectOverview, (_event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(getProjectOverviewInputSchema, input);
      const projectPath = await resolveProjectPath(form.projectId);
      return getProjectOverview(projectPath);
    })
  );
}
