import { app, BrowserWindow, ipcMain } from "electron";
import { PlatformAppChannels } from "@shared/ipc/platform/app.channels";
import {
  openDevToolsInputSchema,
  reportRendererErrorInputSchema,
} from "@shared/ipc/platform/app.schemas";
import logger from "@main/infra/logger";
import { validate } from "../_kit/schema";
import { wrapHandler } from "../_kit/wrap-handler";

export function registerAppHandlers(): void {
  ipcMain.handle(PlatformAppChannels.openDevTools, (event, input: unknown) =>
    wrapHandler(() => {
      validate(openDevToolsInputSchema, input);
      const window = BrowserWindow.fromWebContents(event.sender);
      window?.webContents.openDevTools({ mode: "detach" });
    })
  );

  ipcMain.handle(PlatformAppChannels.reportRendererError, (_event, input: unknown) =>
    wrapHandler(() => {
      const report = validate(reportRendererErrorInputSchema, input);
      logger.error(`[renderer:${report.source}] ${report.message}`, report);
    })
  );

  ipcMain.handle(PlatformAppChannels.getUserDataPath, () =>
    wrapHandler(() => {
      return app.getPath("userData");
    })
  );
}
