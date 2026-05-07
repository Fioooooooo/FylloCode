import { ipcMain } from "electron";
import { SettingsChannels } from "@shared/types/channels";
import { wrapHandler } from "./_kit/wrap-handler";

export function registerSettingsHandlers(): void {
  ipcMain.handle(SettingsChannels.get, () =>
    wrapHandler(async () => {
      // TODO: read preferences from persistent storage
      return null;
    })
  );

  ipcMain.handle(SettingsChannels.update, (_event, patch: Record<string, unknown>) =>
    wrapHandler(async () => {
      // TODO: persist preferences
      void patch;
      return null;
    })
  );
}
