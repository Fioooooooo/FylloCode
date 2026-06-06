import { mkdirSync, rmSync, writeFileSync } from "fs";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const { tempRoot } = await vi.hoisted(async () => {
  const { createTestTempRoot } = await import("@test/main/test-temp-root");

  return {
    tempRoot: createTestTempRoot("fyllocode-window-state-"),
  };
});

vi.mock("@main/infra/paths", () => ({
  getDataSubPath: vi.fn((subPath: string) => `${tempRoot}/${subPath}`),
}));

import { loadMainWindowState, saveMainWindowState } from "@main/infra/storage/window-state-store";

beforeEach(() => {
  rmSync(tempRoot, { recursive: true, force: true });
});

afterEach(() => {
  rmSync(tempRoot, { recursive: true, force: true });
});

describe("window-state-store", () => {
  it("returns null when the state file does not exist", () => {
    expect(loadMainWindowState()).toBeNull();
  });

  it("round-trips a valid window state", () => {
    const state = {
      bounds: { x: 120, y: 80, width: 1280, height: 760 },
      isMaximized: true,
    };

    saveMainWindowState(state);

    expect(loadMainWindowState()).toEqual(state);
  });

  it("returns null for malformed or invalid state files", () => {
    const dir = `${tempRoot}/window-state`;
    mkdirSync(dir, { recursive: true });
    writeFileSync(`${dir}/main-window.json`, "{ not-json", "utf8");

    expect(loadMainWindowState()).toBeNull();

    writeFileSync(
      `${dir}/main-window.json`,
      JSON.stringify({
        bounds: { x: 10, y: 10, width: -1, height: 760 },
        isMaximized: false,
      }),
      "utf8"
    );

    expect(loadMainWindowState()).toBeNull();
  });
});
