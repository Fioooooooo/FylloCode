import { app } from "electron";
import type { AppAboutInfo, PreferencesConfig } from "@shared/types/settings";

const APP_RELEASE_CHANNEL = "Preview";
const APP_COPYRIGHT = "Copyright © 2026 Fio";
const APP_REPOSITORY_URL = "https://github.com/Fioooooooo/FylloCode";
const APP_FEEDBACK_URL = "https://github.com/Fioooooooo/FylloCode/issues";

export function getAppAboutInfo(): AppAboutInfo {
  return {
    version: app.getVersion(),
    releaseChannel: APP_RELEASE_CHANNEL,
    copyright: APP_COPYRIGHT,
    repositoryUrl: APP_REPOSITORY_URL,
    feedbackUrl: APP_FEEDBACK_URL,
  };
}

export function getSettingsPreferences(): PreferencesConfig | null {
  return null;
}

export function updateSettingsPreferences(
  patch: Partial<PreferencesConfig>
): PreferencesConfig | null {
  void patch;
  return null;
}
