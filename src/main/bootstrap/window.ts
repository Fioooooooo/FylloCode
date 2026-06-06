import { shell, BrowserWindow, screen, type Rectangle } from "electron";
import { join } from "path";
import { is, platform } from "@electron-toolkit/utils";
import {
  loadMainWindowState,
  saveMainWindowState,
  type MainWindowState,
} from "@main/infra/storage/window-state-store";
import icon from "../../../resources/icon.png?asset";

export const DEFAULT_MAIN_WINDOW_SIZE = Object.freeze({
  width: 1280,
  height: 760,
});

export const MIN_MAIN_WINDOW_SIZE = Object.freeze({
  width: 960,
  height: 640,
});

interface MainWindowStateSnapshotSource {
  isMaximized(): boolean;
  getBounds(): Rectangle;
  getNormalBounds(): Rectangle;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function overlapArea(a: Rectangle, b: Rectangle): number {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);

  return Math.max(0, width) * Math.max(0, height);
}

function getFallbackWorkArea(workAreas: Rectangle[]): Rectangle {
  return (
    workAreas[0] ?? {
      x: 0,
      y: 0,
      width: DEFAULT_MAIN_WINDOW_SIZE.width,
      height: DEFAULT_MAIN_WINDOW_SIZE.height,
    }
  );
}

function getCurrentWorkAreas(): Rectangle[] {
  const primaryDisplay = screen.getPrimaryDisplay();
  const displays = screen.getAllDisplays();

  return [primaryDisplay, ...displays.filter((display) => display.id !== primaryDisplay.id)].map(
    (display) => display.workArea
  );
}

function getDefaultBounds(workArea: Rectangle): Rectangle {
  const width = Math.min(DEFAULT_MAIN_WINDOW_SIZE.width, workArea.width);
  const height = Math.min(DEFAULT_MAIN_WINDOW_SIZE.height, workArea.height);

  return {
    x: workArea.x + Math.floor((workArea.width - width) / 2),
    y: workArea.y + Math.floor((workArea.height - height) / 2),
    width,
    height,
  };
}

function findBestWorkArea(bounds: Rectangle, workAreas: Rectangle[]): Rectangle | null {
  let bestArea: Rectangle | null = null;
  let bestOverlap = 0;

  for (const workArea of workAreas) {
    const overlap = overlapArea(bounds, workArea);
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      bestArea = workArea;
    }
  }

  return bestOverlap > 0 ? bestArea : null;
}

export function resolveMainWindowState(
  savedState: MainWindowState | null,
  workAreas: Rectangle[]
): MainWindowState {
  const fallbackBounds = getDefaultBounds(getFallbackWorkArea(workAreas));

  if (!savedState) {
    return { bounds: fallbackBounds, isMaximized: false };
  }

  const workArea = findBestWorkArea(savedState.bounds, workAreas);
  if (!workArea) {
    return { bounds: fallbackBounds, isMaximized: false };
  }

  const width = clamp(savedState.bounds.width, MIN_MAIN_WINDOW_SIZE.width, workArea.width);
  const height = clamp(savedState.bounds.height, MIN_MAIN_WINDOW_SIZE.height, workArea.height);
  const maxX = Math.max(workArea.x, workArea.x + workArea.width - width);
  const maxY = Math.max(workArea.y, workArea.y + workArea.height - height);

  return {
    bounds: {
      x: clamp(savedState.bounds.x, workArea.x, maxX),
      y: clamp(savedState.bounds.y, workArea.y, maxY),
      width,
      height,
    },
    isMaximized: savedState.isMaximized,
  };
}

export function captureMainWindowState(mainWindow: MainWindowStateSnapshotSource): MainWindowState {
  const isMaximized = mainWindow.isMaximized();

  return {
    bounds: isMaximized ? mainWindow.getNormalBounds() : mainWindow.getBounds(),
    isMaximized,
  };
}

export function createMainWindow(): BrowserWindow {
  const resolvedState = resolveMainWindowState(loadMainWindowState(), getCurrentWorkAreas());

  const mainWindow = new BrowserWindow({
    x: resolvedState.bounds.x,
    y: resolvedState.bounds.y,
    width: resolvedState.bounds.width,
    height: resolvedState.bounds.height,
    minWidth: MIN_MAIN_WINDOW_SIZE.width,
    minHeight: MIN_MAIN_WINDOW_SIZE.height,
    show: false,
    autoHideMenuBar: true,
    ...(platform.isLinux ? { icon } : {}),
    ...(platform.isMacOS
      ? {
          titleBarStyle: "hidden" as const,
          trafficLightPosition: { x: 12, y: 10 },
        }
      : {}),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
    },
  });

  if (resolvedState.isMaximized) {
    mainWindow.maximize();
  }

  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.on("close", () => {
    saveMainWindowState(captureMainWindowState(mainWindow));
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: "deny" };
  });

  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }

  return mainWindow;
}
