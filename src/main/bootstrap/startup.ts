import { nativeTheme, type BrowserWindow } from "electron";
import type { WindowStateKey } from "@main/infra/storage/window-state-store";
import { createFylloWindow, loadFylloWindow, type CreateFylloWindowOptions } from "./window";
import { markLifecycleMetric } from "./startup-metrics";

export const STARTUP_PAGE_BARRIER_TIMEOUT_MS = 1_000;
export const STARTUP_BACKGROUND_LIGHT = "#f8fafc";
export const STARTUP_BACKGROUND_DARK = "#0f172a";

export interface WindowStateController {
  current: WindowStateKey;
}

export interface StartupWindowOwnership {
  token: object;
  stateController: WindowStateController;
}

interface StartupWindowControllerOptions {
  createWindow?: (options: CreateFylloWindowOptions) => BrowserWindow;
  barrierTimeoutMs?: number;
  scheduleNextTurn?: (callback: () => void) => void;
}

export type StartupBarrierResult = "loaded" | "failed" | "timeout" | "closed";

export class StartupWindowController {
  readonly window: BrowserWindow;
  readonly ownership: StartupWindowOwnership;
  readonly firstVisible: Promise<StartupBarrierResult>;

  private readonly scheduleNextTurn: (callback: () => void) => void;
  private resolveBarrier!: (result: StartupBarrierResult) => void;
  private barrierSettled = false;
  private transferred = false;
  private aborted = false;
  private barrierTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: StartupWindowControllerOptions = {}) {
    this.scheduleNextTurn = options.scheduleNextTurn ?? setImmediate;
    const stateController: WindowStateController = { current: { role: "launcher" } };
    this.ownership = { token: {}, stateController };
    this.firstVisible = new Promise((resolve) => {
      this.resolveBarrier = resolve;
    });

    const createWindow = options.createWindow ?? createFylloWindow;
    this.window = createWindow({
      stateKey: stateController.current,
      getStateKey: () => stateController.current,
      initialPage: null,
      showImmediately: true,
      backgroundColor: nativeTheme.shouldUseDarkColors
        ? STARTUP_BACKGROUND_DARK
        : STARTUP_BACKGROUND_LIGHT,
    });
    markLifecycleMetric("startup-window-created");

    this.window.webContents.once("did-finish-load", this.handleDidFinishLoad);
    this.window.webContents.once("did-fail-load", this.handleDidFailLoad);
    this.window.once("closed", this.handleClosed);
    this.barrierTimer = setTimeout(
      () => this.settleBarrier("timeout"),
      options.barrierTimeoutMs ?? STARTUP_PAGE_BARRIER_TIMEOUT_MS
    );
    void loadFylloWindow(this.window, "startup").catch(() => this.settleBarrier("failed"));
  }

  isUsable(): boolean {
    return !this.aborted && !this.window.isDestroyed();
  }

  focus(): boolean {
    if (!this.isUsable()) return false;
    if (this.window.isMinimized()) this.window.restore();
    this.window.focus();
    return true;
  }

  takeOwnership(): StartupWindowOwnership {
    if (this.transferred || !this.isUsable()) {
      throw new Error("Startup window ownership is unavailable");
    }
    this.transferred = true;
    this.window.removeListener("closed", this.handleClosed);
    return this.ownership;
  }

  async loadFormalRenderer(): Promise<void> {
    if (!this.isUsable()) throw new Error("Startup window is unavailable");
    await loadFylloWindow(this.window, "index");
  }

  abort(): void {
    this.aborted = true;
    this.clearBarrierResources();
    this.settleBarrier("closed");
  }

  destroy(): void {
    this.abort();
    if (!this.window.isDestroyed()) this.window.destroy();
  }

  prepareForShutdown(): object | null {
    if (this.transferred || this.window.isDestroyed()) return null;
    this.window.hide();
    return this.ownership.token;
  }

  private readonly handleDidFinishLoad = (): void => {
    markLifecycleMetric("startup-page-loaded");
    this.scheduleNextTurn(() => this.settleBarrier("loaded"));
  };

  private readonly handleDidFailLoad = (
    _event: Electron.Event,
    _errorCode: number,
    _errorDescription: string,
    _validatedUrl: string,
    isMainFrame: boolean
  ): void => {
    if (isMainFrame) this.settleBarrier("failed");
  };

  private readonly handleClosed = (): void => {
    this.aborted = true;
    this.settleBarrier("closed");
  };

  private settleBarrier(result: StartupBarrierResult): void {
    if (this.barrierSettled) return;
    this.barrierSettled = true;
    this.clearBarrierResources();
    markLifecycleMetric("startup-visible", result === "loaded" ? "ok" : "failed");
    this.resolveBarrier(result);
  }

  private clearBarrierResources(): void {
    if (this.barrierTimer) {
      clearTimeout(this.barrierTimer);
      this.barrierTimer = null;
    }
    this.window.webContents.removeListener("did-finish-load", this.handleDidFinishLoad);
    this.window.webContents.removeListener("did-fail-load", this.handleDidFailLoad);
  }
}

export function createStartupWindowController(
  options: StartupWindowControllerOptions = {}
): StartupWindowController {
  return new StartupWindowController(options);
}
