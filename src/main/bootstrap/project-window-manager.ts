import { BrowserWindow, type WebContents } from "electron";
import type { WindowContext } from "@shared/types/window";
import {
  applyFylloWindowState,
  createFylloWindow,
  type CreateFylloWindowOptions,
} from "@main/bootstrap/window";
import type { WindowStateKey } from "@main/infra/storage/window-state-store";

type ProjectWindowContext = Extract<WindowContext, { role: "project" }>;
type LauncherWindowContext = Extract<WindowContext, { role: "launcher" }>;

export type ProjectWindowOpenStatus = "bound-current" | "created" | "focused-existing";

export interface ProjectWindowOpenResult {
  status: ProjectWindowOpenStatus;
  context: ProjectWindowContext;
}

interface WindowStateController {
  current: WindowStateKey;
}

interface RegisteredWindowIds {
  windowId: number;
  webContentsId: number;
}

export interface ProjectWindowManagerOptions {
  createWindow?: (options: CreateFylloWindowOptions) => BrowserWindow;
  applyWindowState?: (window: BrowserWindow, stateKey: WindowStateKey) => void;
  fromWebContents?: (webContents: WebContents) => BrowserWindow | null;
  runtimeCleanup?: (projectId: string, projectPath?: string) => void | Promise<void>;
}

export class ProjectWindowManager {
  private readonly createWindow: (options: CreateFylloWindowOptions) => BrowserWindow;
  private readonly applyWindowState: (window: BrowserWindow, stateKey: WindowStateKey) => void;
  private readonly fromWebContents: (webContents: WebContents) => BrowserWindow | null;
  private readonly runtimeCleanup: (
    projectId: string,
    projectPath?: string
  ) => void | Promise<void>;
  private readonly projectWindows = new Map<string, BrowserWindow>();
  private readonly contextsByWebContentsId = new Map<number, WindowContext>();
  private readonly stateControllersByWindowId = new Map<number, WindowStateController>();
  private readonly windows = new Set<BrowserWindow>();
  private readonly skipRuntimeCleanupOnClose = new Set<string>();
  private launcherWindow: BrowserWindow | null = null;
  private lastActiveWindow: BrowserWindow | null = null;

  constructor(options: ProjectWindowManagerOptions = {}) {
    this.createWindow = options.createWindow ?? createFylloWindow;
    this.applyWindowState = options.applyWindowState ?? applyFylloWindowState;
    this.fromWebContents =
      options.fromWebContents ?? ((webContents) => BrowserWindow.fromWebContents(webContents));
    this.runtimeCleanup = options.runtimeCleanup ?? cleanupProjectRuntimeForWindow;
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

  openProjectWindow(projectId: string, sourceWebContents?: WebContents): ProjectWindowOpenResult {
    const existing = this.getUsableWindow(this.projectWindows.get(projectId) ?? null);
    if (existing) {
      this.focusWindow(existing);
      return {
        status: "focused-existing",
        context: this.getProjectContext(existing, projectId),
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
      const context = this.bindLauncherToProject(sourceWindow, projectId);
      return { status: "bound-current", context };
    }

    const stateController: WindowStateController = {
      current: { role: "project", projectId },
    };
    const projectWindow = this.createWindow({
      stateKey: stateController.current,
      getStateKey: () => stateController.current,
    });
    const context = this.getProjectContext(projectWindow, projectId);

    this.projectWindows.set(projectId, projectWindow);
    this.registerWindow(projectWindow, context, stateController);

    return { status: "created", context };
  }

  focusProjectWindow(projectId: string): boolean {
    const projectWindow = this.getUsableWindow(this.projectWindows.get(projectId) ?? null);
    if (!projectWindow) return false;
    this.focusWindow(projectWindow);
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

  sendToProject(projectId: string, channel: string, payload: unknown): boolean {
    const projectWindow = this.getUsableWindow(this.projectWindows.get(projectId) ?? null);
    if (!projectWindow) return false;

    projectWindow.webContents.send(channel, payload);
    return true;
  }

  sendToAll(channel: string, payload: unknown): void {
    for (const window of this.windows) {
      if (this.isUsableWindow(window)) {
        window.webContents.send(channel, payload);
      }
    }
  }

  closeProjectWindow(projectId: string, options: { cleanupRuntime?: boolean } = {}): boolean {
    const projectWindow = this.getUsableWindow(this.projectWindows.get(projectId) ?? null);
    if (!projectWindow) return false;

    if (options.cleanupRuntime === false) {
      this.skipRuntimeCleanupOnClose.add(projectId);
    }
    projectWindow.close();
    return true;
  }

  async cleanupProjectRuntime(projectId: string, projectPath?: string): Promise<void> {
    if (projectPath === undefined) {
      await this.runtimeCleanup(projectId);
      return;
    }
    await this.runtimeCleanup(projectId, projectPath);
  }

  private bindLauncherToProject(window: BrowserWindow, projectId: string): ProjectWindowContext {
    const stateController = this.stateControllersByWindowId.get(window.id);
    if (stateController) {
      stateController.current = { role: "project", projectId };
    }

    this.applyWindowState(window, { role: "project", projectId });
    this.launcherWindow = null;
    this.projectWindows.set(projectId, window);

    const context = this.getProjectContext(window, projectId);
    this.contextsByWebContentsId.set(window.webContents.id, context);

    return context;
  }

  private registerWindow(
    window: BrowserWindow,
    context: WindowContext,
    stateController: WindowStateController
  ): void {
    const ids: RegisteredWindowIds = {
      windowId: window.id,
      webContentsId: window.webContents.id,
    };

    this.windows.add(window);
    this.contextsByWebContentsId.set(ids.webContentsId, context);
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
    this.stateControllersByWindowId.delete(ids.windowId);

    if (this.launcherWindow === window) {
      this.launcherWindow = null;
    }

    if (context?.role === "project" && this.projectWindows.get(context.projectId) === window) {
      this.projectWindows.delete(context.projectId);
      if (!this.skipRuntimeCleanupOnClose.delete(context.projectId)) {
        void this.cleanupProjectRuntime(context.projectId);
      }
    }

    if (this.lastActiveWindow === window) {
      this.lastActiveWindow = null;
    }
  }

  private getLauncherContext(window: BrowserWindow): LauncherWindowContext {
    return { windowId: window.id, role: "launcher", projectId: null };
  }

  private getProjectContext(window: BrowserWindow, projectId: string): ProjectWindowContext {
    return { windowId: window.id, role: "project", projectId };
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

async function cleanupProjectRuntimeForWindow(
  projectId: string,
  knownProjectPath?: string
): Promise<void> {
  const [
    { getProject },
    { closeProjectProbes },
    { sessionRegistry },
    { proposalStatusService },
    { disposeProject: disposeLineageEventConsumerProject },
  ] = await Promise.all([
    import("@main/services/workspace/project/project-service"),
    import("@main/services/session/chat/session-probe-service"),
    import("@main/services/session/chat/session-registry"),
    import("@main/services/proposal/browser/proposal-status-service"),
    import("@main/services/insight/lineage/mcp-event-consumer"),
  ]);

  await closeProjectProbes(projectId);
  sessionRegistry.cancelProject(projectId);

  const projectPath = knownProjectPath ?? (await getProject(projectId))?.path;
  if (!projectPath) {
    return;
  }

  proposalStatusService.unwatchProject(projectPath);
  disposeLineageEventConsumerProject(projectPath);
}

export const projectWindowManager = new ProjectWindowManager();
