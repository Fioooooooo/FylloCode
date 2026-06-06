import type { IpcResponse } from "@shared/types/ipc";
import type { AppAboutInfo, PreferencesConfig, ReleaseCheckResult } from "@shared/types/settings";

export const settingsApi = {
  get(): Promise<IpcResponse<PreferencesConfig | null>> {
    return window.api.settings.get();
  },

  getAppInfo(): Promise<IpcResponse<AppAboutInfo>> {
    return window.api.settings.getAppInfo();
  },

  checkLatestRelease(): Promise<IpcResponse<ReleaseCheckResult>> {
    return window.api.settings.checkLatestRelease();
  },

  update(patch: Partial<PreferencesConfig>): Promise<IpcResponse<PreferencesConfig>> {
    return window.api.settings.update(patch);
  },
};
