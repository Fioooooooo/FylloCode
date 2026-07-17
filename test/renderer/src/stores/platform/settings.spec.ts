import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useSettingsStore } from "@renderer/stores/platform/settings";
import { releaseApi } from "@renderer/api/platform/release";
import { settingsApi } from "@renderer/api/platform/settings";

vi.mock("@renderer/api/platform/settings", () => ({
  settingsApi: {
    getAppInfo: vi.fn(),
    get: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@renderer/api/platform/release", () => ({
  releaseApi: {
    checkLatestRelease: vi.fn(),
  },
}));

describe("useSettingsStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("defaults the language preference to Chinese", () => {
    const store = useSettingsStore();

    expect(store.preferences.language).toBe("zh");
  });

  it("deduplicates concurrent ensureAboutInfoLoaded calls", async () => {
    let resolveRequest:
      ((value: Awaited<ReturnType<typeof settingsApi.getAppInfo>>) => void) | undefined;
    vi.mocked(settingsApi.getAppInfo).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRequest = resolve;
        })
    );

    const store = useSettingsStore();
    const loading = Promise.all([store.ensureAboutInfoLoaded(), store.ensureAboutInfoLoaded()]);

    expect(settingsApi.getAppInfo).toHaveBeenCalledTimes(1);
    expect(store.aboutInfoLoading).toBe(true);

    resolveRequest?.({
      ok: true,
      data: {
        version: "0.9.0-beta.1",
        releaseChannel: "Preview",
        copyright: "Copyright © 2026 Fio",
        repositoryUrl: "https://github.com/Fioooooooo/FylloCode",
        feedbackUrl: "https://github.com/Fioooooooo/FylloCode/issues",
      },
    });

    await loading;

    expect(store.aboutInfoLoading).toBe(false);
    expect(store.aboutInfoError).toBeNull();
    expect(store.aboutInfo).toEqual({
      version: "0.9.0-beta.1",
      releaseChannel: "Preview",
      copyright: "Copyright © 2026 Fio",
      repositoryUrl: "https://github.com/Fioooooooo/FylloCode",
      feedbackUrl: "https://github.com/Fioooooooo/FylloCode/issues",
    });
  });

  it("loads latest release check results", async () => {
    vi.mocked(releaseApi.checkLatestRelease).mockResolvedValue({
      ok: true,
      data: {
        status: "update-available",
        currentVersion: "0.11.3",
        latestVersion: "0.11.4",
        releaseUrl: "https://github.com/Fioooooooo/FylloCode/releases/tag/v0.11.4",
        releaseName: "FylloCode 0.11.4",
        publishedAt: "2026-06-02T00:00:00Z",
      },
    });

    const store = useSettingsStore();
    await store.checkLatestRelease();

    expect(releaseApi.checkLatestRelease).toHaveBeenCalledTimes(1);
    expect(store.releaseCheckLoading).toBe(false);
    expect(store.releaseCheckError).toBeNull();
    expect(store.releaseCheckResult?.status).toBe("update-available");
  });

  it("keeps about info when release check fails", async () => {
    vi.mocked(releaseApi.checkLatestRelease).mockResolvedValue({
      ok: false,
      error: {
        code: "RELEASE_CHECK_FAILED",
        message: "network unavailable",
      },
    });

    const store = useSettingsStore();
    store.aboutInfo = {
      version: "0.9.0-beta.1",
      releaseChannel: "Preview",
      copyright: "Copyright © 2026 Fio",
      repositoryUrl: "https://github.com/Fioooooooo/FylloCode",
      feedbackUrl: "https://github.com/Fioooooooo/FylloCode/issues",
    };

    await store.checkLatestRelease();

    expect(store.releaseCheckResult).toBeNull();
    expect(store.releaseCheckError).toBe("network unavailable");
    expect(store.aboutInfo).toEqual({
      version: "0.9.0-beta.1",
      releaseChannel: "Preview",
      copyright: "Copyright © 2026 Fio",
      repositoryUrl: "https://github.com/Fioooooooo/FylloCode",
      feedbackUrl: "https://github.com/Fioooooooo/FylloCode/issues",
    });
  });
});
