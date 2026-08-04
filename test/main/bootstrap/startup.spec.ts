import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BrowserWindow } from "electron";
import { StartupWindowController } from "@main/bootstrap/startup";

function createFakeWindow() {
  const windowEvents = new EventEmitter();
  const webContents = new EventEmitter();
  Object.assign(webContents, {
    id: 10,
    getURL: vi.fn(() => "file:///app/out/renderer/startup.html"),
  });
  let destroyed = false;
  const window = Object.assign(windowEvents, {
    id: 1,
    webContents,
    loadFile: vi.fn(() => Promise.resolve()),
    loadURL: vi.fn(() => Promise.resolve()),
    isDestroyed: vi.fn(() => destroyed),
    isMinimized: vi.fn(() => false),
    restore: vi.fn(),
    focus: vi.fn(),
    hide: vi.fn(),
    destroy: vi.fn(() => {
      destroyed = true;
      windowEvents.emit("closed");
    }),
  });
  return window;
}

describe("StartupWindowController", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("settles the visible barrier on the turn after the static page loads", async () => {
    const window = createFakeWindow();
    let nextTurn: (() => void) | null = null;
    const controller = new StartupWindowController({
      createWindow: () => window as unknown as BrowserWindow,
      scheduleNextTurn: (callback) => {
        nextTurn = callback;
      },
    });
    let settled = false;
    void controller.firstVisible.then(() => {
      settled = true;
    });

    window.webContents.emit("did-finish-load");
    await Promise.resolve();
    expect(settled).toBe(false);

    (nextTurn as (() => void) | null)?.();
    await expect(controller.firstVisible).resolves.toBe("loaded");
  });

  it("settles with the background fallback when startup loading times out", async () => {
    vi.useFakeTimers();
    const window = createFakeWindow();
    const controller = new StartupWindowController({
      createWindow: () => window as unknown as BrowserWindow,
      barrierTimeoutMs: 25,
    });

    await vi.advanceTimersByTimeAsync(25);

    await expect(controller.firstVisible).resolves.toBe("timeout");
    expect(window.destroy).not.toHaveBeenCalled();
  });

  it("keeps ownership single-use and refuses navigation after abort", async () => {
    const window = createFakeWindow();
    const controller = new StartupWindowController({
      createWindow: () => window as unknown as BrowserWindow,
    });

    expect(controller.takeOwnership()).toBe(controller.ownership);
    expect(() => controller.takeOwnership()).toThrow("ownership is unavailable");
    controller.abort();
    await expect(controller.loadFormalRenderer()).rejects.toThrow("unavailable");
  });

  it("restores and focuses the startup window for attention requests", () => {
    const window = createFakeWindow();
    vi.mocked(window.isMinimized).mockReturnValue(true);
    const controller = new StartupWindowController({
      createWindow: () => window as unknown as BrowserWindow,
    });

    expect(controller.focus()).toBe(true);
    expect(window.restore).toHaveBeenCalledOnce();
    expect(window.focus).toHaveBeenCalledOnce();
  });
});
