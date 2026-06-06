import { describe, expect, it } from "vitest";
import {
  captureMainWindowState,
  DEFAULT_MAIN_WINDOW_SIZE,
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
});
