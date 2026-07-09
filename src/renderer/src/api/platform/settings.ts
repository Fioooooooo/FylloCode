import type { IpcResponse } from "@shared/types/ipc";
import type { AppAboutInfo, PreferencesConfig } from "@shared/types/settings";

export const settingsApi = {
  get(): Promise<IpcResponse<PreferencesConfig | null>> {
    return window.api.platform.settings.get();
  },

  getAppInfo(): Promise<IpcResponse<AppAboutInfo>> {
    return window.api.platform.settings.getAppInfo();
  },

  update(patch: Partial<PreferencesConfig>): Promise<IpcResponse<PreferencesConfig>> {
    return window.api.platform.settings.update(patch);
  },
};
