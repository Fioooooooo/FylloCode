import { describe, expect, it, vi } from "vitest";
import {
  captureMainWindowState,
  DEFAULT_MAIN_WINDOW_SIZE,
  isSafeExternalUrl,
  MIN_MAIN_WINDOW_SIZE,
  resolveMainWindowState,
} from "@main/bootstrap/window";

describe("window helpers", () => {
  it("uses a centered default size when no state exists", () => {
    const resolved = resolveMainWindowState(null, [{ x: 0, y: 0, width: 1440, height: 900 }]);

    expect(resolved).toEqual({
      bounds: {
        x: 80,
        y: 70,
        width: DEFAULT_MAIN_WINDOW_SIZE.width,
        height: DEFAULT_MAIN_WINDOW_SIZE.height,
      },
      isMaximized: false,
    });
  });

  it("clamps a partially visible restored state into the current work area", () => {
    const resolved = resolveMainWindowState(
      {
        bounds: { x: 1300, y: 100, width: 1200, height: 700 },
        isMaximized: false,
      },
      [{ x: 0, y: 0, width: 1440, height: 900 }]
    );

    expect(resolved).toEqual({
      bounds: { x: 240, y: 100, width: 1200, height: 700 },
      isMaximized: false,
    });
  });

  it("falls back to the default size when the saved state is off-screen", () => {
    const resolved = resolveMainWindowState(
      {
        bounds: { x: -4000, y: 200, width: 1200, height: 700 },
        isMaximized: true,
      },
      [{ x: 0, y: 0, width: 1440, height: 900 }]
    );

    expect(resolved).toEqual({
      bounds: {
        x: 80,
        y: 70,
        width: DEFAULT_MAIN_WINDOW_SIZE.width,
        height: DEFAULT_MAIN_WINDOW_SIZE.height,
      },
      isMaximized: false,
    });
  });

  it("captures the normal bounds when the window is maximized", () => {
    const captured = captureMainWindowState({
      isMaximized: () => true,
      getBounds: () => ({ x: 1, y: 2, width: 3, height: 4 }),
      getNormalBounds: () => ({ x: 12, y: 34, width: 1000, height: 700 }),
    });

    expect(captured).toEqual({
      bounds: { x: 12, y: 34, width: 1000, height: 700 },
      isMaximized: true,
    });
  });

  it("captures the current bounds when the window is not maximized", () => {
    const captured = captureMainWindowState({
      isMaximized: () => false,
      getBounds: () => ({ x: 12, y: 34, width: 1000, height: 700 }),
      getNormalBounds: () => ({ x: 0, y: 0, width: 0, height: 0 }),
    });

    expect(captured).toEqual({
      bounds: { x: 12, y: 34, width: 1000, height: 700 },
      isMaximized: false,
    });
  });

  it("exports the minimum size constants used by the main window", () => {
    expect(MIN_MAIN_WINDOW_SIZE).toEqual({ width: 960, height: 640 });
  });

  describe("isSafeExternalUrl", () => {
    it("allows http and https", () => {
      expect(isSafeExternalUrl("https://example.com/path?q=1")).toBe(true);
      expect(isSafeExternalUrl("http://localhost:3000")).toBe(true);
    });

    it("rejects file and custom schemes that could launch local handlers", () => {
      expect(isSafeExternalUrl("file:///etc/passwd")).toBe(false);
      expect(isSafeExternalUrl("vscode://open")).toBe(false);
      expect(isSafeExternalUrl("smb://host/share")).toBe(false);
      expect(isSafeExternalUrl("javascript:alert(1)")).toBe(false);
    });

    it("rejects malformed input", () => {
      expect(isSafeExternalUrl("not a url")).toBe(false);
      expect(isSafeExternalUrl("")).toBe(false);
    });
  });

  it("uses the provided state key when creating and saving a window", async () => {
    vi.resetModules();

    const stateKey = { role: "project" as const, projectId: "project-a" };
    const loadWindowState = vi.fn(() => ({
      bounds: { x: 123, y: 100, width: 1200, height: 740 },
      isMaximized: false,
    }));
    const saveWindowState = vi.fn();
    const eventHandlers = new Map<string, () => void>();
    const browserWindow = {
      webContents: {
        setWindowOpenHandler: vi.fn(),
        on: vi.fn(),
        getURL: vi.fn(() => "http://localhost:5173/"),
      },
      on: vi.fn((event: string, handler: () => void) => {
        eventHandlers.set(event, handler);
      }),
      maximize: vi.fn(),
      show: vi.fn(),
      isMaximized: vi.fn(() => false),
      getBounds: vi.fn(() => ({ x: 123, y: 100, width: 1200, height: 740 })),
      getNormalBounds: vi.fn(() => ({ x: 0, y: 0, width: 0, height: 0 })),
      loadURL: vi.fn(),
      loadFile: vi.fn(),
    };
    const BrowserWindow = vi.fn(function BrowserWindowMock() {
      return browserWindow;
    });

    vi.doMock("@main/infra/storage/window-state-store", () => ({
      loadWindowState,
      saveWindowState,
    }));
    vi.doMock("electron", () => ({
      BrowserWindow,
      screen: {
        getPrimaryDisplay: vi.fn(() => ({
          id: 1,
          workArea: { x: 0, y: 0, width: 1440, height: 900 },
        })),
        getAllDisplays: vi.fn(() => []),
      },
      shell: { openExternal: vi.fn() },
    }));

    const { createFylloWindow } = await import("@main/bootstrap/window");

    createFylloWindow({ stateKey });

    expect(loadWindowState).toHaveBeenCalledWith(stateKey);
    expect(BrowserWindow).toHaveBeenCalledWith(
      expect.objectContaining({
        x: 123,
        y: 100,
        width: 1200,
        height: 740,
      })
    );

    eventHandlers.get("close")?.();

    expect(saveWindowState).toHaveBeenCalledWith(stateKey, {
      bounds: { x: 123, y: 100, width: 1200, height: 740 },
      isMaximized: false,
    });
  });
});
