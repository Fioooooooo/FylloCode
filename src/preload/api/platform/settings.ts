import { ipcRenderer } from "electron";
import type { IpcResponse } from "@shared/types/ipc";
import { PlatformSettingsChannels } from "@shared/ipc/platform/settings.channels";
import type { AppAboutInfo, PreferencesConfig } from "@shared/types/settings";

export const settingsApi = {
  get(): Promise<IpcResponse<PreferencesConfig | null>> {
    return ipcRenderer.invoke(PlatformSettingsChannels.get, {});
  },

  getAppInfo(): Promise<IpcResponse<AppAboutInfo>> {
    return ipcRenderer.invoke(PlatformSettingsChannels.getAppInfo, {});
  },

  update(patch: Partial<PreferencesConfig>): Promise<IpcResponse<PreferencesConfig>> {
    return ipcRenderer.invoke(PlatformSettingsChannels.update, patch);
  },
};
