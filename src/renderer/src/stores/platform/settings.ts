import { ref } from "vue";
import { defineStore } from "pinia";
import { releaseApi } from "@renderer/api/platform/release";
import { settingsApi } from "@renderer/api/platform/settings";
import type { AppAboutInfo, PreferencesConfig, ReleaseCheckResult } from "@shared/types/settings";

const defaultPreferences: PreferencesConfig = {
  theme: "system",
  language: "zh",
  defaultAgentMode: "auto",
  notificationMethods: ["in-app"],
  autoSaveSession: true,
  tokenStatsPeriod: "monthly",
  budgetAlert: { value: 100000, unit: "tokens" },
};

export const useSettingsStore = defineStore("settings", () => {
  const preferences = ref<PreferencesConfig>({ ...defaultPreferences });
  const aboutInfo = ref<AppAboutInfo | null>(null);
  const aboutInfoLoading = ref(false);
  const aboutInfoError = ref<string | null>(null);
  const aboutInfoLoaded = ref(false);
  const releaseCheckResult = ref<ReleaseCheckResult | null>(null);
  const releaseCheckLoading = ref(false);
  const releaseCheckError = ref<string | null>(null);
  let aboutInfoPromise: Promise<void> | null = null;

  function updatePreference<K extends keyof PreferencesConfig>(
    key: K,
    value: PreferencesConfig[K]
  ): void {
    preferences.value[key] = value;
  }

  async function clearAllHistory(): Promise<void> {
    await new Promise<void>((resolve) => setTimeout(resolve, 300));
  }

  async function ensureAboutInfoLoaded(): Promise<void> {
    if (aboutInfoLoaded.value) {
      return;
    }

    if (aboutInfoPromise) {
      return aboutInfoPromise;
    }

    aboutInfoPromise = (async () => {
      aboutInfoLoading.value = true;
      aboutInfoError.value = null;

      try {
        const result = await settingsApi.getAppInfo();
        if (!result.ok) {
          throw new Error(result.error.message);
        }

        aboutInfo.value = result.data;
        aboutInfoLoaded.value = true;
      } catch (error) {
        aboutInfo.value = null;
        aboutInfoError.value = error instanceof Error ? error.message : String(error);
      } finally {
        aboutInfoLoading.value = false;
      }
    })();

    try {
      await aboutInfoPromise;
    } finally {
      aboutInfoPromise = null;
    }
  }

  async function checkLatestRelease(): Promise<void> {
    releaseCheckLoading.value = true;
    releaseCheckError.value = null;

    try {
      const result = await releaseApi.checkLatestRelease();
      if (!result.ok) {
        throw new Error(result.error.message);
      }

      releaseCheckResult.value = result.data;
    } catch (error) {
      releaseCheckResult.value = null;
      releaseCheckError.value = error instanceof Error ? error.message : String(error);
    } finally {
      releaseCheckLoading.value = false;
    }
  }

  return {
    preferences,
    aboutInfo,
    aboutInfoLoading,
    aboutInfoError,
    releaseCheckResult,
    releaseCheckLoading,
    releaseCheckError,
    updatePreference,
    clearAllHistory,
    ensureAboutInfoLoaded,
    checkLatestRelease,
  };
});
