import { describe, expect, it, vi } from "vitest";
import {
  ProjectWindowManager,
  type ProjectWindowManagerOptions,
} from "@main/bootstrap/project-window-manager";
import type { BrowserWindow, WebContents } from "electron";

interface FakeWindow {
  id: number;
  webContents: {
    id: number;
    send: (channel: string, payload: unknown) => void;
  };
  focus: () => void;
  close: () => void;
  isMinimized: () => boolean;
  restore: () => void;
  isDestroyed: () => boolean;
  on: (event: string, handler: () => void) => void;
  handlers: Map<string, () => void>;
  destroyed: boolean;
}

function createFakeWindow(id: number): FakeWindow {
  let destroyed = false;
  const webContents = {
    id: id * 10,
    send: vi.fn(),
  };
  const window: FakeWindow = {
    id,
    get webContents() {
      if (destroyed) {
        throw new TypeError("Object has been destroyed");
      }
      return webContents;
    },
    focus: vi.fn(),
    close: vi.fn(() => {
      destroyed = true;
      window.handlers.get("closed")?.();
    }),
    isMinimized: vi.fn(() => false),
    restore: vi.fn(),
    isDestroyed: vi.fn(() => destroyed),
    on: vi.fn((event: string, handler: () => void) => {
      window.handlers.set(event, handler);
    }),
    handlers: new Map(),
    get destroyed() {
      return destroyed;
    },
    set destroyed(value: boolean) {
      destroyed = value;
    },
  };

  return window;
}

function createHarness() {
  const windows: FakeWindow[] = [];
  const createWindow = vi.fn<NonNullable<ProjectWindowManagerOptions["createWindow"]>>(() => {
    const window = createFakeWindow(windows.length + 1);
    windows.push(window);
    return window as unknown as BrowserWindow;
  });
  const applyWindowState = vi.fn();
  const runtimeCleanup = vi.fn();
  const fromWebContents = vi.fn((webContents: WebContents) => {
    return (
      (windows.find((window) => (window.webContents as unknown as WebContents) === webContents) as
        | BrowserWindow
        | undefined) ?? null
    );
  });
  const manager = new ProjectWindowManager({
    createWindow,
    applyWindowState,
    fromWebContents,
    runtimeCleanup,
  });

  return { manager, windows, createWindow, applyWindowState, runtimeCleanup };
}

describe("ProjectWindowManager", () => {
  it("keeps a single launcher window and focuses it when reopened", () => {
    const { manager, windows, createWindow } = createHarness();

    const first = manager.openLauncherWindow();
    const second = manager.openLauncherWindow();

    expect(first).toEqual({ windowId: 1, role: "launcher", projectId: null });
    expect(second).toEqual(first);
    expect(createWindow).toHaveBeenCalledOnce();
    expect(windows[0]?.focus).toHaveBeenCalledOnce();
  });

  it("focuses an existing project window instead of creating a duplicate", () => {
    const { manager, windows, createWindow } = createHarness();

    const first = manager.openProjectWindow("project-a");
    const second = manager.openProjectWindow("project-a");

    expect(first.status).toBe("created");
    expect(second.status).toBe("focused-existing");
    expect(second.context).toEqual(first.context);
    expect(createWindow).toHaveBeenCalledOnce();
    expect(windows[0]?.focus).toHaveBeenCalledOnce();
  });

  it("restores a minimized project window before focusing it", () => {
    const { manager, windows } = createHarness();

    manager.openProjectWindow("project-a");
    vi.mocked(windows[0]!.isMinimized).mockReturnValue(true);
    const second = manager.openProjectWindow("project-a");

    expect(second.status).toBe("focused-existing");
    expect(windows[0]?.restore).toHaveBeenCalledOnce();
    expect(windows[0]?.focus).toHaveBeenCalledOnce();
  });

  it("creates separate windows for different projects", () => {
    const { manager, createWindow } = createHarness();

    const projectA = manager.openProjectWindow("project-a");
    const projectB = manager.openProjectWindow("project-b");

    expect(projectA.context).toEqual({ windowId: 1, role: "project", projectId: "project-a" });
    expect(projectB.context).toEqual({ windowId: 2, role: "project", projectId: "project-b" });
    expect(createWindow).toHaveBeenCalledTimes(2);
  });

  it("reuses the launcher for the first project and does not rebind project windows", () => {
    const { manager, windows, createWindow, applyWindowState } = createHarness();

    manager.openLauncherWindow();
    const projectA = manager.openProjectWindow(
      "project-a",
      windows[0]?.webContents as unknown as WebContents
    );
    const projectB = manager.openProjectWindow(
      "project-b",
      windows[0]?.webContents as unknown as WebContents
    );

    expect(projectA.status).toBe("bound-current");
    expect(projectB.status).toBe("created");
    expect(createWindow).toHaveBeenCalledTimes(2);
    expect(applyWindowState).toHaveBeenCalledWith(windows[0], {
      role: "project",
      projectId: "project-a",
    });
    expect(
      manager.getContextByWebContents(windows[0]?.webContents as unknown as WebContents)
    ).toEqual({
      windowId: 1,
      role: "project",
      projectId: "project-a",
    });
  });

  it("clears mappings and project runtime when a project window closes", () => {
    const { manager, windows, runtimeCleanup } = createHarness();

    manager.openProjectWindow("project-a");
    windows[0]?.close();

    expect(manager.sendToProject("project-a", "test:event", { ok: true })).toBe(false);
    expect(runtimeCleanup).toHaveBeenCalledWith("project-a");
  });

  it("can close a project window without running close-triggered runtime cleanup", () => {
    const { manager, windows, runtimeCleanup } = createHarness();

    manager.openProjectWindow("project-a");

    expect(manager.closeProjectWindow("project-a", { cleanupRuntime: false })).toBe(true);

    expect(manager.sendToProject("project-a", "test:event", { ok: true })).toBe(false);
    expect(windows[0]?.close).toHaveBeenCalledOnce();
    expect(runtimeCleanup).not.toHaveBeenCalled();
  });

  it("sends project-scoped events only to the target project window", () => {
    const { manager, windows } = createHarness();

    manager.openProjectWindow("project-a");
    manager.openProjectWindow("project-b");

    expect(manager.sendToProject("project-a", "test:event", { value: 1 })).toBe(true);

    expect(windows[0]?.webContents.send).toHaveBeenCalledWith("test:event", { value: 1 });
    expect(windows[1]?.webContents.send).not.toHaveBeenCalled();
  });

  it("broadcasts global events to every active managed window", () => {
    const { manager, windows } = createHarness();

    manager.openLauncherWindow();
    manager.openProjectWindow("project-a");

    manager.sendToAll("test:global", { value: 2 });

    expect(windows[0]?.webContents.send).toHaveBeenCalledWith("test:global", { value: 2 });
    expect(windows[1]?.webContents.send).toHaveBeenCalledWith("test:global", { value: 2 });
  });

  it("focuses the last active window when requested", () => {
    const { manager, windows } = createHarness();

    manager.openProjectWindow("project-a");
    manager.openProjectWindow("project-b");
    windows[0]?.handlers.get("focus")?.();

    expect(manager.focusLastActiveWindow()).toBe(true);

    expect(windows[0]?.focus).toHaveBeenCalledOnce();
    expect(windows[1]?.focus).not.toHaveBeenCalled();
  });
});
