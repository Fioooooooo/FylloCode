import { describe, expect, it, vi } from "vitest";
import {
  WorkspaceWindowManager,
  type WorkspaceWindowManagerOptions,
} from "@main/bootstrap/workspace-window-manager";
import type { BrowserWindow, WebContents } from "electron";

vi.mock("@main/services/insight/lineage/mcp-event-consumer", () => ({
  disposeWorkspace: vi.fn(),
}));
vi.mock("@main/services/proposal/browser/proposal-status-service", () => ({
  proposalStatusService: { unwatchWorkspace: vi.fn() },
}));
vi.mock("@main/services/session/chat/session-registry", () => ({
  sessionRegistry: { cancelWorkspace: vi.fn() },
}));
vi.mock("@main/services/session/chat/session-probe-service", () => ({
  closeWorkspaceProbes: vi.fn(),
}));
vi.mock("@main/services/workspace/resolver/workspace-resolver", () => ({
  resolveWorkspace: vi.fn(),
}));

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
  const createWindow = vi.fn<NonNullable<WorkspaceWindowManagerOptions["createWindow"]>>(() => {
    const window = createFakeWindow(windows.length + 1);
    windows.push(window);
    return window as unknown as BrowserWindow;
  });
  const applyWindowState = vi.fn();
  const runtimeCleanup = vi.fn();
  const fromWebContents = vi.fn((webContents: WebContents) => {
    return (
      (windows.find((window) => (window.webContents as unknown as WebContents) === webContents) as
        BrowserWindow | undefined) ?? null
    );
  });
  const manager = new WorkspaceWindowManager({
    createWindow,
    applyWindowState,
    fromWebContents,
    runtimeCleanup,
  });

  return { manager, windows, createWindow, applyWindowState, runtimeCleanup };
}

describe("WorkspaceWindowManager", () => {
  it("keeps a single launcher window and focuses it when reopened", () => {
    const { manager, windows, createWindow } = createHarness();

    const first = manager.openLauncherWindow();
    const second = manager.openLauncherWindow();

    expect(first).toEqual({ windowId: 1, role: "launcher", workspaceId: null });
    expect(second).toEqual(first);
    expect(createWindow).toHaveBeenCalledOnce();
    expect(windows[0]?.focus).toHaveBeenCalledOnce();
  });

  it("focuses an existing Workspace window instead of creating a duplicate", () => {
    const { manager, windows, createWindow } = createHarness();

    const first = manager.openWorkspaceWindow("workspace-a");
    const second = manager.openWorkspaceWindow("workspace-a");

    expect(first.status).toBe("created");
    expect(second.status).toBe("focused-existing");
    expect(second.context).toEqual(first.context);
    expect(createWindow).toHaveBeenCalledOnce();
    expect(windows[0]?.focus).toHaveBeenCalledOnce();
  });

  it("restores a minimized Workspace window before focusing it", () => {
    const { manager, windows } = createHarness();

    manager.openWorkspaceWindow("workspace-a");
    vi.mocked(windows[0]!.isMinimized).mockReturnValue(true);
    const second = manager.openWorkspaceWindow("workspace-a");

    expect(second.status).toBe("focused-existing");
    expect(windows[0]?.restore).toHaveBeenCalledOnce();
    expect(windows[0]?.focus).toHaveBeenCalledOnce();
  });

  it("creates separate windows for different Workspaces", () => {
    const { manager, createWindow } = createHarness();

    const workspaceA = manager.openWorkspaceWindow("workspace-a");
    const workspaceB = manager.openWorkspaceWindow("workspace-b");

    expect(workspaceA.context).toEqual({
      windowId: 1,
      role: "workspace",
      workspaceId: "workspace-a",
    });
    expect(workspaceB.context).toEqual({
      windowId: 2,
      role: "workspace",
      workspaceId: "workspace-b",
    });
    expect(createWindow).toHaveBeenCalledTimes(2);
  });

  it("reuses the launcher for the first Workspace and does not rebind Workspace windows", () => {
    const { manager, windows, createWindow, applyWindowState } = createHarness();

    manager.openLauncherWindow();
    const workspaceA = manager.openWorkspaceWindow(
      "workspace-a",
      windows[0]?.webContents as unknown as WebContents
    );
    const workspaceB = manager.openWorkspaceWindow(
      "workspace-b",
      windows[0]?.webContents as unknown as WebContents
    );

    expect(workspaceA.status).toBe("bound-current");
    expect(workspaceB.status).toBe("created");
    expect(createWindow).toHaveBeenCalledTimes(2);
    expect(applyWindowState).toHaveBeenCalledWith(windows[0], {
      role: "workspace",
      workspaceId: "workspace-a",
    });
    expect(
      manager.getContextByWebContents(windows[0]?.webContents as unknown as WebContents)
    ).toEqual({
      windowId: 1,
      role: "workspace",
      workspaceId: "workspace-a",
    });
  });

  it("clears mappings and Workspace runtime when a Workspace window closes", () => {
    const { manager, windows, runtimeCleanup } = createHarness();

    manager.openWorkspaceWindow("workspace-a");
    windows[0]?.close();

    expect(manager.sendToWorkspace("workspace-a", "test:event", { ok: true })).toBe(false);
    expect(runtimeCleanup).toHaveBeenCalledWith("workspace-a");
  });

  it("can close a Workspace window without running close-triggered runtime cleanup", () => {
    const { manager, windows, runtimeCleanup } = createHarness();

    manager.openWorkspaceWindow("workspace-a");

    expect(manager.closeWorkspaceWindow("workspace-a", { cleanupRuntime: false })).toBe(true);

    expect(manager.sendToWorkspace("workspace-a", "test:event", { ok: true })).toBe(false);
    expect(windows[0]?.close).toHaveBeenCalledOnce();
    expect(runtimeCleanup).not.toHaveBeenCalled();
  });

  it("sends Workspace-scoped events only to the target Workspace window", () => {
    const { manager, windows } = createHarness();

    manager.openWorkspaceWindow("workspace-a");
    manager.openWorkspaceWindow("workspace-b");

    expect(manager.sendToWorkspace("workspace-a", "test:event", { value: 1 })).toBe(true);

    expect(windows[0]?.webContents.send).toHaveBeenCalledWith("test:event", { value: 1 });
    expect(windows[1]?.webContents.send).not.toHaveBeenCalled();
  });

  it("broadcasts global events to every active managed window", () => {
    const { manager, windows } = createHarness();

    manager.openLauncherWindow();
    manager.openWorkspaceWindow("workspace-a");

    manager.sendToAll("test:global", { value: 2 });

    expect(windows[0]?.webContents.send).toHaveBeenCalledWith("test:global", { value: 2 });
    expect(windows[1]?.webContents.send).toHaveBeenCalledWith("test:global", { value: 2 });
  });

  it("focuses the last active window when requested", () => {
    const { manager, windows } = createHarness();

    manager.openWorkspaceWindow("workspace-a");
    manager.openWorkspaceWindow("workspace-b");
    windows[0]?.handlers.get("focus")?.();

    expect(manager.focusLastActiveWindow()).toBe(true);

    expect(windows[0]?.focus).toHaveBeenCalledOnce();
    expect(windows[1]?.focus).not.toHaveBeenCalled();
  });
});
