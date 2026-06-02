import { beforeEach, describe, expect, it, vi } from "vitest";
import { ipcMain } from "electron";
import { SettingsChannels } from "@shared/types/channels";
import { IpcErrorCodes } from "@shared/constants/error-codes";

const mocks = vi.hoisted(() => ({
  getAppAboutInfo: vi.fn(),
  getSettingsPreferences: vi.fn(),
  updateSettingsPreferences: vi.fn(),
  checkLatestRelease: vi.fn(),
}));

vi.mock("@main/services/settings/settings-service", () => ({
  getAppAboutInfo: mocks.getAppAboutInfo,
  getSettingsPreferences: mocks.getSettingsPreferences,
  updateSettingsPreferences: mocks.updateSettingsPreferences,
}));

vi.mock("@main/services/release/release-version-service", () => ({
  checkLatestRelease: mocks.checkLatestRelease,
}));

describe("registerSettingsHandlers", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.getAppAboutInfo.mockReturnValue({
      version: "0.9.0-beta.1",
      releaseChannel: "Preview",
      copyright: "Copyright © 2026 Fio",
      repositoryUrl: "https://github.com/Fioooooooo/FylloCode",
      feedbackUrl: "https://github.com/Fioooooooo/FylloCode/issues",
    });
    mocks.getSettingsPreferences.mockReturnValue(null);
    mocks.updateSettingsPreferences.mockReturnValue(null);
    mocks.checkLatestRelease.mockResolvedValue({
      status: "update-available",
      currentVersion: "0.11.3",
      latestVersion: "0.11.4",
      releaseUrl: "https://github.com/Fioooooooo/FylloCode/releases/tag/v0.11.4",
      releaseName: "FylloCode 0.11.4",
      publishedAt: "2026-06-02T00:00:00Z",
    });

    const { registerSettingsHandlers } = await import("@main/ipc/settings");
    registerSettingsHandlers();
  });

  function handler(channel: string): (event: unknown, input: unknown) => Promise<unknown> {
    const call = vi
      .mocked(ipcMain.handle)
      .mock.calls.find(([registeredChannel]) => registeredChannel === channel);
    expect(call).toBeTruthy();
    return call![1] as (event: unknown, input: unknown) => Promise<unknown>;
  }

  it("returns app about info in the standard IpcResponse shape", async () => {
    const result = await handler(SettingsChannels.getAppInfo)({}, {});

    expect(result).toEqual({
      ok: true,
      data: {
        version: "0.9.0-beta.1",
        releaseChannel: "Preview",
        copyright: "Copyright © 2026 Fio",
        repositoryUrl: "https://github.com/Fioooooooo/FylloCode",
        feedbackUrl: "https://github.com/Fioooooooo/FylloCode/issues",
      },
    });
    expect(mocks.getAppAboutInfo).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid getAppInfo payloads through validation", async () => {
    const result = await handler(SettingsChannels.getAppInfo)({}, { unexpected: true });

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: IpcErrorCodes.VALIDATION_ERROR,
      }),
    });
    expect(mocks.getAppAboutInfo).not.toHaveBeenCalled();
  });

  it("returns latest release check results in the standard IpcResponse shape", async () => {
    const result = await handler(SettingsChannels.checkLatestRelease)({}, {});

    expect(result).toEqual({
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
    expect(mocks.checkLatestRelease).toHaveBeenCalledTimes(1);
  });

  it("normalizes latest release check domain errors", async () => {
    mocks.checkLatestRelease.mockRejectedValue(
      Object.assign(new Error("GitHub latest release request failed"), {
        code: IpcErrorCodes.RELEASE_CHECK_FAILED,
      })
    );

    const result = await handler(SettingsChannels.checkLatestRelease)({}, {});

    expect(result).toEqual({
      ok: false,
      error: {
        code: IpcErrorCodes.RELEASE_CHECK_FAILED,
        message: "GitHub latest release request failed",
      },
    });
  });
});
