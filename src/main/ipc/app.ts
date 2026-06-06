import { app, BrowserWindow, ipcMain } from "electron";
import { AppChannels } from "@shared/types/channels";
import { openDevToolsInputSchema, reportRendererErrorInputSchema } from "@shared/schemas/ipc/app";
import logger from "@main/infra/logger";
import { validate } from "./_kit/schema";
import { wrapHandler } from "./_kit/wrap-handler";

export function registerAppHandlers(): void {
  ipcMain.handle(AppChannels.openDevTools, (event, input: unknown) =>
    wrapHandler(() => {
      validate(openDevToolsInputSchema, input);
      const window = BrowserWindow.fromWebContents(event.sender);
      window?.webContents.openDevTools({ mode: "detach" });
    })
  );

  ipcMain.handle(AppChannels.reportRendererError, (_event, input: unknown) =>
    wrapHandler(() => {
      const report = validate(reportRendererErrorInputSchema, input);
      logger.error(`[renderer:${report.source}] ${report.message}`, report);
    })
  );

  ipcMain.handle(AppChannels.getUserDataPath, () =>
    wrapHandler(() => {
      return app.getPath("userData");
    })
  );
}
