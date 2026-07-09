import { ipcMain } from "electron";
import { PlatformSettingsChannels } from "@shared/ipc/platform/settings.channels";
import {
  getAppInfoInputSchema,
  getSettingsInputSchema,
  updateSettingsInputSchema,
} from "@shared/ipc/platform/settings.schemas";
import {
  getAppAboutInfo,
  getSettingsPreferences,
  updateSettingsPreferences,
} from "@main/services/platform/settings/settings-service";
import { validate } from "../_kit/schema";
import { wrapHandler } from "../_kit/wrap-handler";

export function registerSettingsHandlers(): void {
  ipcMain.handle(PlatformSettingsChannels.get, (_event, input: unknown) =>
    wrapHandler(async () => {
      validate(getSettingsInputSchema, input);
      return getSettingsPreferences();
    })
  );

  ipcMain.handle(PlatformSettingsChannels.getAppInfo, (_event, input: unknown) =>
    wrapHandler(async () => {
      validate(getAppInfoInputSchema, input);
      return getAppAboutInfo();
    })
  );

  ipcMain.handle(PlatformSettingsChannels.update, (_event, input: unknown) =>
    wrapHandler(async () => {
      const patch = validate(updateSettingsInputSchema, input);
      return updateSettingsPreferences(patch);
    })
  );
}
