import { BrowserWindow, type WebContents } from "electron";
import type { WindowContext } from "@shared/types/window";
import {
  applyFylloWindowState,
  captureMainWindowState,
  createFylloWindow,
  type CreateFylloWindowOptions,
} from "@main/bootstrap/window";
import type { StartupWindowOwnership } from "@main/bootstrap/startup";
import { saveWindowState, type WindowStateKey } from "@main/infra/storage/window-state-store";
import { disposeWorkspace as disposeLineageEventConsumerWorkspace } from "@main/services/insight/lineage/mcp-event-consumer";
import { proposalStatusService } from "@main/services/proposal/browser/proposal-status-service";
import { sessionRegistry } from "@main/services/session/chat/session-registry";
import { closeWorkspaceProbes } from "@main/services/session/chat/session-probe-service";

type WorkspaceWindowContext = Extract<WindowContext, { role: "workspace" }>;
type LauncherWindowContext = Extract<WindowContext, { role: "launcher" }>;

export type WorkspaceWindowOpenStatus = "bound-current" | "created" | "focused-existing";

export interface WorkspaceWindowOpenResult {
  status: WorkspaceWindowOpenStatus;
  context: WorkspaceWindowContext;
}

interface WindowStateController {
  current: WindowStateKey;
}

interface ReservedLauncher {
  generation: number;
  ownershipToken: object;
}

interface RegisteredWindowIds {
  windowId: number;
  webContentsId: number;
}

export interface WorkspaceWindowManagerOptions {
  createWindow?: (options: CreateFylloWindowOptions) => BrowserWindow;
  applyWindowState?: (window: BrowserWindow, stateKey: WindowStateKey) => void;
  fromWebContents?: (webContents: WebContents) => BrowserWindow | null;
  runtimeCleanup?: (workspaceId: string) => void | Promise<void>;
}

export class WorkspaceWindowManager {
  private readonly createWindow: (options: CreateFylloWindowOptions) => BrowserWindow;
  private readonly applyWindowState: (window: BrowserWindow, stateKey: WindowStateKey) => void;
  private readonly fromWebContents: (webContents: WebContents) => BrowserWindow | null;
  private readonly runtimeCleanup: (workspaceId: string) => void | Promise<void>;
  private readonly workspaceWindows = new Map<string, BrowserWindow>();
  private readonly contextsByWebContentsId = new Map<number, WindowContext>();
  private readonly stateControllersByWindowId = new Map<number, WindowStateController>();
  private readonly windows = new Set<BrowserWindow>();
  private readonly skipRuntimeCleanupOnClose = new Set<string>();
  private readonly reservedLaunchersByWindowId = new Map<number, ReservedLauncher>();
  private readonly formalGenerationsByWebContentsId = new Map<number, number>();
  private launcherWindow: BrowserWindow | null = null;
  private lastActiveWindow: BrowserWindow | null = null;
  private nextFormalGeneration = 1;

  constructor(options: WorkspaceWindowManagerOptions = {}) {
    this.createWindow = options.createWindow ?? createFylloWindow;
    this.applyWindowState = options.applyWindowState ?? applyFylloWindowState;
    this.fromWebContents =
      options.fromWebContents ?? ((webContents) => BrowserWindow.fromWebContents(webContents));
    this.runtimeCleanup = options.runtimeCleanup ?? cleanupWorkspaceRuntimeForWindow;
  }

  openLauncherWindow(): LauncherWindowContext {
    const existing = this.getUsableWindow(this.launcherWindow);
    if (existing) {
      this.focusWindow(existing);
      return this.getLauncherContext(existing);
    }

    const stateController: WindowStateController = { current: { role: "launcher" } };
    const launcherWindow = this.createWindow({
      stateKey: stateController.current,
      getStateKey: () => stateController.current,
    });

    this.launcherWindow = launcherWindow;
    this.registerWindow(launcherWindow, this.getLauncherContext(launcherWindow), stateController);

    return this.getLauncherContext(launcherWindow);
  }

  reserveLauncherWindow(window: BrowserWindow, ownership: StartupWindowOwnership): number {
    if (!this.isUsableWindow(window) || this.getUsableWindow(this.launcherWindow)) {
      throw new Error("Launcher window cannot be reserved");
    }

    const generation = this.nextFormalGeneration++;
    this.launcherWindow = window;
    this.reservedLaunchersByWindowId.set(window.id, {
      generation,
      ownershipToken: ownership.token,
    });
    this.registerWindow(window, null, ownership.stateController);
    return generation;
  }

  activateLauncherContext(window: BrowserWindow, generation: number): LauncherWindowContext {
    const reservation = this.reservedLaunchersByWindowId.get(window.id);
    if (
      !reservation ||
      reservation.generation !== generation ||
      this.launcherWindow !== window ||
      !this.isUsableWindow(window)
    ) {
      throw new Error("Launcher window reservation is no longer valid");
    }

    const context = this.getLauncherContext(window);
    this.contextsByWebContentsId.set(window.webContents.id, context);
    this.formalGenerationsByWebContentsId.set(window.webContents.id, generation);
    this.reservedLaunchersByWindowId.delete(window.id);
    return context;
  }

  getActiveFormalGeneration(webContents: WebContents): number | null {
    return this.formalGenerationsByWebContentsId.get(webContents.id) ?? null;
  }

  isActiveFormalRenderer(webContents: WebContents, generation: number): boolean {
    return this.getActiveFormalGeneration(webContents) === generation;
  }

  prepareForShutdown(seenOwnershipTokens: Set<object> = new Set()): Set<object> {
    for (const window of this.windows) {
      if (!this.isUsableWindow(window)) continue;
      const reservation = this.reservedLaunchersByWindowId.get(window.id);
      if (reservation) {
        if (seenOwnershipTokens.has(reservation.ownershipToken)) continue;
        seenOwnershipTokens.add(reservation.ownershipToken);
      }
      const stateController = this.stateControllersByWindowId.get(window.id);
      if (stateController) {
        saveWindowState(stateController.current, captureMainWindowState(window));
      }
      window.hide();
    }
    return seenOwnershipTokens;
  }

  // Workspace window lifecycle strategy:
  // 1. Reuse an existing Workspace window if one is already open.
  // 2. If the source window is the launcher, convert it in-place (bind) rather than opening
  //    a second window, preserving the user's window position and reducing window churn.
  // 3. Otherwise create a fresh Workspace window.
  openWorkspaceWindow(
    workspaceId: string,
    sourceWebContents?: WebContents
  ): WorkspaceWindowOpenResult {
    const existing = this.getUsableWindow(this.workspaceWindows.get(workspaceId) ?? null);
    if (existing) {
      this.focusWindow(existing);
      return {
        status: "focused-existing",
        context: this.getWorkspaceContext(existing, workspaceId),
      };
    }

    const sourceWindow = sourceWebContents ? this.fromWebContents(sourceWebContents) : null;
    const sourceContext = sourceWebContents
      ? this.getContextByWebContents(sourceWebContents)
      : null;

    if (
      sourceWindow &&
      sourceContext?.role === "launcher" &&
      this.getUsableWindow(this.launcherWindow) === sourceWindow
    ) {
      const context = this.bindLauncherToWorkspace(sourceWindow, workspaceId);
      return { status: "bound-current", context };
    }

    const stateController: WindowStateController = {
      current: { role: "workspace", workspaceId },
    };
    const workspaceWindow = this.createWindow({
      stateKey: stateController.current,
      getStateKey: () => stateController.current,
    });
    const context = this.getWorkspaceContext(workspaceWindow, workspaceId);

    this.workspaceWindows.set(workspaceId, workspaceWindow);
    this.registerWindow(workspaceWindow, context, stateController);

    return { status: "created", context };
  }

  focusWorkspaceWindow(workspaceId: string): boolean {
    const workspaceWindow = this.getUsableWindow(this.workspaceWindows.get(workspaceId) ?? null);
    if (!workspaceWindow) return false;
    this.focusWindow(workspaceWindow);
    return true;
  }

  focusLastActiveWindow(): boolean {
    const lastActiveWindow = this.getUsableWindow(this.lastActiveWindow);
    if (lastActiveWindow) {
      this.focusWindow(lastActiveWindow);
      return true;
    }

    const fallbackWindow = [...this.windows].find((window) => this.isUsableWindow(window));
    if (!fallbackWindow) return false;
    this.focusWindow(fallbackWindow);
    return true;
  }

  getContextByWebContents(webContents: WebContents): WindowContext | null {
    return this.contextsByWebContentsId.get(webContents.id) ?? null;
  }

  sendToWorkspace(workspaceId: string, channel: string, payload: unknown): boolean {
    const workspaceWindow = this.getUsableWindow(this.workspaceWindows.get(workspaceId) ?? null);
    if (!workspaceWindow) return false;

    workspaceWindow.webContents.send(channel, payload);
    return true;
  }

  sendToAll(channel: string, payload: unknown): void {
    for (const window of this.windows) {
      if (this.isUsableWindow(window) && this.contextsByWebContentsId.has(window.webContents.id)) {
        window.webContents.send(channel, payload);
      }
    }
  }

  closeWorkspaceWindow(workspaceId: string, options: { cleanupRuntime?: boolean } = {}): boolean {
    const workspaceWindow = this.getUsableWindow(this.workspaceWindows.get(workspaceId) ?? null);
    if (!workspaceWindow) return false;

    if (options.cleanupRuntime === false) {
      this.skipRuntimeCleanupOnClose.add(workspaceId);
    }
    workspaceWindow.close();
    return true;
  }

  async cleanupWorkspaceRuntime(workspaceId: string): Promise<void> {
    await this.runtimeCleanup(workspaceId);
  }

  private bindLauncherToWorkspace(
    window: BrowserWindow,
    workspaceId: string
  ): WorkspaceWindowContext {
    const stateController = this.stateControllersByWindowId.get(window.id);
    if (stateController) {
      stateController.current = { role: "workspace", workspaceId };
    }

    this.applyWindowState(window, { role: "workspace", workspaceId });
    this.launcherWindow = null;
    this.workspaceWindows.set(workspaceId, window);

    const context = this.getWorkspaceContext(window, workspaceId);
    this.contextsByWebContentsId.set(window.webContents.id, context);

    return context;
  }

  private registerWindow(
    window: BrowserWindow,
    context: WindowContext | null,
    stateController: WindowStateController
  ): void {
    const ids: RegisteredWindowIds = {
      windowId: window.id,
      webContentsId: window.webContents.id,
    };

    this.windows.add(window);
    if (context) {
      this.contextsByWebContentsId.set(ids.webContentsId, context);
    }
    this.stateControllersByWindowId.set(ids.windowId, stateController);
    this.lastActiveWindow = window;

    window.on("focus", () => {
      this.lastActiveWindow = window;
    });

    window.on("closed", () => {
      this.unregisterWindow(window, ids);
    });
  }

  private unregisterWindow(window: BrowserWindow, ids: RegisteredWindowIds): void {
    const context = this.contextsByWebContentsId.get(ids.webContentsId);

    this.windows.delete(window);
    this.contextsByWebContentsId.delete(ids.webContentsId);
    this.formalGenerationsByWebContentsId.delete(ids.webContentsId);
    this.stateControllersByWindowId.delete(ids.windowId);
    this.reservedLaunchersByWindowId.delete(ids.windowId);

    if (this.launcherWindow === window) {
      this.launcherWindow = null;
    }

    if (
      context?.role === "workspace" &&
      this.workspaceWindows.get(context.workspaceId) === window
    ) {
      this.workspaceWindows.delete(context.workspaceId);
      if (!this.skipRuntimeCleanupOnClose.delete(context.workspaceId)) {
        void this.cleanupWorkspaceRuntime(context.workspaceId);
      }
    }

    if (this.lastActiveWindow === window) {
      this.lastActiveWindow = null;
    }
  }

  private getLauncherContext(window: BrowserWindow): LauncherWindowContext {
    return { windowId: window.id, role: "launcher", workspaceId: null };
  }

  private getWorkspaceContext(window: BrowserWindow, workspaceId: string): WorkspaceWindowContext {
    return { windowId: window.id, role: "workspace", workspaceId };
  }

  private focusWindow(window: BrowserWindow): void {
    this.lastActiveWindow = window;
    if (window.isMinimized()) {
      window.restore();
    }
    window.focus();
  }

  private getUsableWindow(window: BrowserWindow | null): BrowserWindow | null {
    return window && this.isUsableWindow(window) ? window : null;
  }

  private isUsableWindow(window: BrowserWindow): boolean {
    return !window.isDestroyed();
  }
}

async function cleanupWorkspaceRuntimeForWindow(workspaceId: string): Promise<void> {
  await closeWorkspaceProbes(workspaceId);
  sessionRegistry.cancelWorkspace(workspaceId);

  proposalStatusService.unwatchWorkspace(workspaceId);
  disposeLineageEventConsumerWorkspace(workspaceId);
}

export const workspaceWindowManager = new WorkspaceWindowManager();
