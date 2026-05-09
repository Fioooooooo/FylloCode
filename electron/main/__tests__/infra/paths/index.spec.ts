import { mkdirSync, rmSync } from "fs";
import { join } from "path";
import { app } from "electron";
import { is } from "@electron-toolkit/utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getResourcesPath, getResourcesPathCandidates } from "@main/infra/paths";

const tempRoot = `/private/tmp/fyllocode-resources-paths-${Math.random().toString(36).slice(2)}`;
const resourcesPath = join(tempRoot, "FylloCode.app", "Contents", "Resources");

function setProcessCwd(path: string): void {
  vi.spyOn(process, "cwd").mockReturnValue(path);
}

function setProcessResourcesPath(path: string): void {
  Object.defineProperty(process, "resourcesPath", {
    configurable: true,
    value: path,
  });
}

beforeEach(() => {
  rmSync(tempRoot, { recursive: true, force: true });
  vi.restoreAllMocks();
});

afterEach(() => {
  rmSync(tempRoot, { recursive: true, force: true });
  vi.restoreAllMocks();
  (is as { dev: boolean }).dev = true;
  setProcessResourcesPath(undefined as unknown as string);
});

describe("infra paths resources", () => {
  it("returns the repository resources directory in development", () => {
    (is as { dev: boolean }).dev = true;
    setProcessCwd(join(tempRoot, "repo"));

    expect(getResourcesPathCandidates()).toEqual([join(tempRoot, "repo", "resources")]);
    expect(getResourcesPath()).toBe(join(tempRoot, "repo", "resources"));
  });

  it("prefers unpacked packaged resources in production", () => {
    (is as { dev: boolean }).dev = false;
    setProcessResourcesPath(resourcesPath);
    vi.mocked(app.getAppPath).mockReturnValue(join(resourcesPath, "app.asar"));
    const unpackedResources = join(resourcesPath, "app.asar.unpacked", "resources");
    mkdirSync(unpackedResources, { recursive: true });

    expect(getResourcesPathCandidates()).toEqual([
      unpackedResources,
      join(resourcesPath, "app.asar", "resources"),
      join(resourcesPath, "resources"),
    ]);
    expect(getResourcesPath()).toBe(unpackedResources);
  });

  it("falls back to app.asar resources when unpacked resources do not exist", () => {
    (is as { dev: boolean }).dev = false;
    setProcessResourcesPath(resourcesPath);
    vi.mocked(app.getAppPath).mockReturnValue(join(resourcesPath, "app.asar"));
    const asarResources = join(resourcesPath, "app.asar", "resources");
    mkdirSync(asarResources, { recursive: true });

    expect(getResourcesPath()).toBe(asarResources);
  });
});
