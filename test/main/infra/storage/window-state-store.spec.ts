import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
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

import {
  deleteWorkspaceWindowState,
  loadMainWindowState,
  loadWindowState,
  saveMainWindowState,
  saveWindowState,
} from "@main/infra/storage/window-state-store";

beforeEach(() => {
  rmSync(tempRoot, { recursive: true, force: true });
});

afterEach(() => {
  rmSync(tempRoot, { recursive: true, force: true });
});

describe("window-state-store", () => {
  it("writes launcher and Workspace state without using the Project namespace", () => {
    const state = {
      bounds: { x: 10, y: 20, width: 1100, height: 700 },
      isMaximized: false,
    };

    saveMainWindowState(state);
    saveWindowState({ role: "launcher" }, state);
    saveWindowState({ role: "workspace", workspaceId: "workspace-a" }, state);

    expect(existsSync(`${tempRoot}/window-state/main-window.json`)).toBe(true);
    expect(existsSync(`${tempRoot}/window-state/launcher.json`)).toBe(true);
    expect(existsSync(`${tempRoot}/window-state/workspaces/workspace-a.json`)).toBe(true);
    expect(existsSync(`${tempRoot}/window-state/projects`)).toBe(false);
  });

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

  it("round-trips launcher and Workspace window state through separate files", () => {
    const launcherState = {
      bounds: { x: 10, y: 20, width: 1100, height: 700 },
      isMaximized: false,
    };
    const workspaceState = {
      bounds: { x: 300, y: 220, width: 1300, height: 820 },
      isMaximized: true,
    };

    saveWindowState({ role: "launcher" }, launcherState);
    saveWindowState({ role: "workspace", workspaceId: "workspace-a" }, workspaceState);

    expect(loadWindowState({ role: "launcher" })).toEqual(launcherState);
    expect(loadWindowState({ role: "workspace", workspaceId: "workspace-a" })).toEqual(
      workspaceState
    );
  });

  it("falls back to the legacy main-window file for launcher state", () => {
    const legacyState = {
      bounds: { x: 50, y: 60, width: 1200, height: 760 },
      isMaximized: true,
    };

    saveMainWindowState(legacyState);

    expect(loadWindowState({ role: "launcher" })).toEqual(legacyState);
    expect(loadMainWindowState()).toEqual(legacyState);
  });

  it("returns null for invalid launcher state before reading a valid legacy fallback", () => {
    const dir = `${tempRoot}/window-state`;
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      `${dir}/launcher.json`,
      JSON.stringify({
        bounds: { x: 10, y: 10, width: -1, height: 760 },
        isMaximized: false,
      }),
      "utf8"
    );

    expect(loadWindowState({ role: "launcher" })).toBeNull();
  });

  it("keeps Workspace window states isolated by Workspace ID", () => {
    const workspaceAState = {
      bounds: { x: 0, y: 0, width: 1000, height: 700 },
      isMaximized: false,
    };
    const workspaceBState = {
      bounds: { x: 200, y: 200, width: 1400, height: 900 },
      isMaximized: true,
    };

    saveWindowState({ role: "workspace", workspaceId: "workspace-a" }, workspaceAState);
    saveWindowState({ role: "workspace", workspaceId: "workspace-b" }, workspaceBState);

    expect(loadWindowState({ role: "workspace", workspaceId: "workspace-a" })).toEqual(
      workspaceAState
    );
    expect(loadWindowState({ role: "workspace", workspaceId: "workspace-b" })).toEqual(
      workspaceBState
    );
  });

  it("does not read a legacy Project state as Workspace state", () => {
    const legacyProjectDir = `${tempRoot}/window-state/projects`;
    mkdirSync(legacyProjectDir, { recursive: true });
    writeFileSync(
      `${legacyProjectDir}/workspace-a.json`,
      JSON.stringify({
        bounds: { x: 1, y: 2, width: 1000, height: 700 },
        isMaximized: false,
      }),
      "utf8"
    );

    expect(loadWindowState({ role: "workspace", workspaceId: "workspace-a" })).toBeNull();
  });

  it("deletes one Workspace state idempotently without touching launcher or peers", async () => {
    const state = { bounds: { x: 0, y: 0, width: 1000, height: 700 }, isMaximized: false };
    saveWindowState({ role: "launcher" }, state);
    saveWindowState({ role: "workspace", workspaceId: "workspace-a" }, state);
    saveWindowState({ role: "workspace", workspaceId: "workspace-b" }, state);

    await deleteWorkspaceWindowState("workspace-a");
    await deleteWorkspaceWindowState("workspace-a");

    expect(loadWindowState({ role: "launcher" })).toEqual(state);
    expect(loadWindowState({ role: "workspace", workspaceId: "workspace-a" })).toBeNull();
    expect(loadWindowState({ role: "workspace", workspaceId: "workspace-b" })).toEqual(state);
  });
});
