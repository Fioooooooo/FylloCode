import { ipcMain } from "electron";
import { SettingsChannels } from "@shared/types/channels";
import {
  checkLatestReleaseInputSchema,
  getAppInfoInputSchema,
  getSettingsInputSchema,
  updateSettingsInputSchema,
} from "@shared/schemas/ipc/settings";
import { checkLatestRelease } from "@main/services/release/release-version-service";
import {
  getAppAboutInfo,
  getSettingsPreferences,
  updateSettingsPreferences,
} from "@main/services/settings/settings-service";
import { validate } from "./_kit/schema";
import { wrapHandler } from "./_kit/wrap-handler";

export function registerSettingsHandlers(): void {
  ipcMain.handle(SettingsChannels.get, (_event, input: unknown) =>
    wrapHandler(async () => {
      validate(getSettingsInputSchema, input);
      return getSettingsPreferences();
    })
  );

  ipcMain.handle(SettingsChannels.getAppInfo, (_event, input: unknown) =>
    wrapHandler(async () => {
      validate(getAppInfoInputSchema, input);
      return getAppAboutInfo();
    })
  );

  ipcMain.handle(SettingsChannels.checkLatestRelease, (_event, input: unknown) =>
    wrapHandler(async () => {
      validate(checkLatestReleaseInputSchema, input);
      return checkLatestRelease();
    })
  );

  ipcMain.handle(SettingsChannels.update, (_event, input: unknown) =>
    wrapHandler(async () => {
      const patch = validate(updateSettingsInputSchema, input);
      return updateSettingsPreferences(patch);
    })
  );
}
