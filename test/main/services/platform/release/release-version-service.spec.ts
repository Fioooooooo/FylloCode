import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "electron";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import {
  checkLatestRelease,
  compareReleaseVersions,
} from "@main/services/platform/release/release-version-service";

function mockResponse(payload: unknown, init: { ok?: boolean; status?: number } = {}): Response {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: vi.fn().mockResolvedValue(payload),
  } as unknown as Response;
}

describe("release-version-service", () => {
  beforeEach(() => {
    vi.mocked(app.getVersion).mockReturnValue("0.11.3");
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("compareReleaseVersions", () => {
    it("detects a newer release and accepts a leading v", () => {
      expect(compareReleaseVersions("0.11.3", "v0.11.4")).toBe("update-available");
    });

    it("treats equal and older remote versions as up to date", () => {
      expect(compareReleaseVersions("0.11.3", "v0.11.3")).toBe("up-to-date");
      expect(compareReleaseVersions("0.11.4", "v0.11.3")).toBe("up-to-date");
    });

    it("rejects invalid version formats", () => {
      expect(() => compareReleaseVersions("0.11.3-beta.1", "v0.11.4")).toThrowError(
        expect.objectContaining({ code: IpcErrorCodes.RELEASE_VERSION_INVALID })
      );
      expect(() => compareReleaseVersions("0.11.3", "release-0.11.4")).toThrowError(
        expect.objectContaining({ code: IpcErrorCodes.RELEASE_VERSION_INVALID })
      );
    });
  });

  it("returns update metadata from GitHub latest release", async () => {
    vi.mocked(fetch).mockResolvedValue(
      mockResponse({
        tag_name: "v0.11.4",
        html_url: "https://github.com/Fioooooooo/FylloCode/releases/tag/v0.11.4",
        name: "FylloCode 0.11.4",
        published_at: "2026-06-02T00:00:00Z",
      })
    );

    await expect(checkLatestRelease()).resolves.toEqual({
      status: "update-available",
      currentVersion: "0.11.3",
      latestVersion: "0.11.4",
      releaseUrl: "https://github.com/Fioooooooo/FylloCode/releases/tag/v0.11.4",
      releaseName: "FylloCode 0.11.4",
      publishedAt: "2026-06-02T00:00:00Z",
    });
  });

  it("maps non-2xx GitHub responses to RELEASE_CHECK_FAILED", async () => {
    vi.mocked(fetch).mockResolvedValue(mockResponse({}, { ok: false, status: 404 }));

    await expect(checkLatestRelease()).rejects.toMatchObject({
      code: IpcErrorCodes.RELEASE_CHECK_FAILED,
    });
  });

  it("maps invalid GitHub response shape to RELEASE_CHECK_FAILED", async () => {
    vi.mocked(fetch).mockResolvedValue(mockResponse({ tag_name: "v0.11.4" }));

    await expect(checkLatestRelease()).rejects.toMatchObject({
      code: IpcErrorCodes.RELEASE_CHECK_FAILED,
    });
  });

  it("maps non-object GitHub responses to RELEASE_CHECK_FAILED", async () => {
    vi.mocked(fetch).mockResolvedValue(mockResponse(null));

    await expect(checkLatestRelease()).rejects.toMatchObject({
      code: IpcErrorCodes.RELEASE_CHECK_FAILED,
    });
  });
});
