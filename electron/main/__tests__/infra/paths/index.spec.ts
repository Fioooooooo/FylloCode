import { mkdirSync, rmSync } from "fs";
import { join } from "path";
import { is } from "@electron-toolkit/utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestTempRoot } from "@main/__tests__/test-temp-root";
import { getAppUnpackedPath, getResourcesPath } from "@main/infra/paths";

const tempRoot = createTestTempRoot("fyllocode-resources-paths-");
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

    expect(getResourcesPath()).toBe(join(tempRoot, "repo", "resources"));
  });

  it("returns the app.asar.unpacked directory in production", () => {
    (is as { dev: boolean }).dev = false;
    setProcessResourcesPath(resourcesPath);
    const unpackedRoot = join(resourcesPath, "app.asar.unpacked");
    mkdirSync(unpackedRoot, { recursive: true });

    expect(getAppUnpackedPath()).toBe(unpackedRoot);
    expect(getResourcesPath()).toBe(join(unpackedRoot, "resources"));
  });

  it("builds the unpacked resources path without probing the filesystem", () => {
    (is as { dev: boolean }).dev = false;
    setProcessResourcesPath(resourcesPath);

    expect(getResourcesPath()).toBe(join(resourcesPath, "app.asar.unpacked", "resources"));
  });
});
