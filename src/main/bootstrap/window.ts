import { shell, BrowserWindow, screen, type Rectangle } from "electron";
import { join } from "path";
import { is, platform } from "@electron-toolkit/utils";
import {
  loadWindowState,
  saveWindowState,
  type MainWindowState,
  type WindowStateKey,
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

interface WindowStateApplyTarget {
  isMaximized(): boolean;
  maximize(): void;
  unmaximize(): void;
  setBounds(bounds: Rectangle): void;
}

export interface CreateFylloWindowOptions {
  stateKey: WindowStateKey;
  getStateKey?: () => WindowStateKey;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Only http/https URLs are safe to hand to `shell.openExternal`. Restricting by
 * scheme (not host) keeps arbitrary agent-supplied web links working while
 * blocking file:// and custom-scheme URLs that could launch local handlers.
 */
export function isSafeExternalUrl(rawUrl: string): boolean {
  try {
    const { protocol } = new URL(rawUrl);
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
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

export function resolveFylloWindowState(stateKey: WindowStateKey): MainWindowState {
  return resolveMainWindowState(loadWindowState(stateKey), getCurrentWorkAreas());
}

function getCurrentStateKey(options: CreateFylloWindowOptions): WindowStateKey {
  return options.getStateKey?.() ?? options.stateKey;
}

export function applyFylloWindowState(
  mainWindow: WindowStateApplyTarget,
  stateKey: WindowStateKey
): MainWindowState {
  const resolvedState = resolveFylloWindowState(stateKey);

  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  }

  mainWindow.setBounds(resolvedState.bounds);

  if (resolvedState.isMaximized) {
    mainWindow.maximize();
  }

  return resolvedState;
}

export function createFylloWindow(options: CreateFylloWindowOptions): BrowserWindow {
  const resolvedState = resolveFylloWindowState(options.stateKey);

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
    saveWindowState(getCurrentStateKey(options), captureMainWindowState(mainWindow));
  });

  // Open external links in the system browser, but only for http/https. The
  // app never opens its own windows, so every requested window is an outbound
  // link (e.g. a source URL surfaced by an agent). Restricting the scheme — not
  // the host — keeps arbitrary web links working while blocking file:// and
  // custom-scheme URLs that could launch local handlers.
  mainWindow.webContents.setWindowOpenHandler((details) => {
    if (isSafeExternalUrl(details.url)) {
      void shell.openExternal(details.url);
    }
    return { action: "deny" };
  });

  // The renderer should never navigate away from the app shell. Block any
  // top-level navigation to a different document; route safe external URLs to
  // the system browser instead.
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (url === mainWindow.webContents.getURL()) {
      return;
    }
    event.preventDefault();
    if (isSafeExternalUrl(url)) {
      void shell.openExternal(url);
    }
  });

  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }

  return mainWindow;
}

export function createMainWindow(): BrowserWindow {
  return createFylloWindow({ stateKey: { role: "launcher" } });
}
