import { app } from "electron";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import type { ReleaseCheckResult, ReleaseCheckStatus } from "@shared/types/settings";
import { ipcError } from "@shared/errors/ipc-error";

const LATEST_RELEASE_URL = "https://api.github.com/repos/Fioooooooo/FylloCode/releases/latest";

type GithubReleaseResponse = {
  tag_name?: unknown;
  html_url?: unknown;
  name?: unknown;
  published_at?: unknown;
};

type ParsedVersion = readonly [major: number, minor: number, patch: number];

export async function checkLatestRelease(): Promise<ReleaseCheckResult> {
  const currentVersion = app.getVersion();
  const release = await fetchLatestRelease();
  const latestVersion = normalizeVersion(release.tagName);
  const status = compareReleaseVersions(currentVersion, release.tagName);

  return {
    status,
    currentVersion,
    latestVersion,
    releaseUrl: release.releaseUrl,
    releaseName: release.releaseName,
    publishedAt: release.publishedAt,
  };
}

export function compareReleaseVersions(
  currentVersion: string,
  latestTag: string
): ReleaseCheckStatus {
  const current = parseVersion(currentVersion);
  const latest = parseVersion(latestTag);

  if (!current || !latest) {
    throw ipcError(
      IpcErrorCodes.RELEASE_VERSION_INVALID,
      "Release version must use major.minor.patch format"
    );
  }

  for (let index = 0; index < current.length; index += 1) {
    if (latest[index] > current[index]) return "update-available";
    if (latest[index] < current[index]) return "up-to-date";
  }

  return "up-to-date";
}

async function fetchLatestRelease(): Promise<{
  tagName: string;
  releaseUrl: string;
  releaseName?: string;
  publishedAt?: string;
}> {
  let response: Response;
  try {
    response = await fetch(LATEST_RELEASE_URL, {
      headers: {
        Accept: "application/vnd.github+json",
      },
    });
  } catch (error) {
    throw ipcError(
      IpcErrorCodes.RELEASE_CHECK_FAILED,
      `Failed to request latest release: ${String(error)}`
    );
  }

  if (!response.ok) {
    throw ipcError(
      IpcErrorCodes.RELEASE_CHECK_FAILED,
      `GitHub latest release request failed with status ${response.status}`
    );
  }

  let payload: unknown;
  try {
    payload = (await response.json()) as GithubReleaseResponse;
  } catch (error) {
    throw ipcError(
      IpcErrorCodes.RELEASE_CHECK_FAILED,
      `Failed to parse latest release response: ${String(error)}`
    );
  }

  return parseGithubRelease(payload);
}

function parseGithubRelease(payload: unknown): {
  tagName: string;
  releaseUrl: string;
  releaseName?: string;
  publishedAt?: string;
} {
  if (!isGithubReleaseResponse(payload)) {
    throw ipcError(IpcErrorCodes.RELEASE_CHECK_FAILED, "GitHub latest release response is invalid");
  }

  if (typeof payload.tag_name !== "string" || typeof payload.html_url !== "string") {
    throw ipcError(IpcErrorCodes.RELEASE_CHECK_FAILED, "GitHub latest release response is invalid");
  }

  return {
    tagName: payload.tag_name,
    releaseUrl: payload.html_url,
    releaseName: typeof payload.name === "string" ? payload.name : undefined,
    publishedAt: typeof payload.published_at === "string" ? payload.published_at : undefined,
  };
}

function isGithubReleaseResponse(value: unknown): value is GithubReleaseResponse {
  return typeof value === "object" && value !== null;
}

function normalizeVersion(version: string): string {
  return version.replace(/^v/i, "");
}

function parseVersion(version: string): ParsedVersion | null {
  const match = normalizeVersion(version).match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return null;

  return [Number(match[1]), Number(match[2]), Number(match[3])];
}
