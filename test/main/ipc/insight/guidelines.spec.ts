import { beforeEach, describe, expect, it, vi } from "vitest";
import { ipcMain } from "electron";
import { InsightGuidelinesChannels as GuidelinesChannels } from "@shared/ipc/insight/guidelines.channels";
import type { IpcResponse } from "@shared/types/ipc";

const mocks = vi.hoisted(() => ({
  getContextByWebContents: vi.fn(),
  resolveWorkspace: vi.fn(),
  getGuidelinesBrowser: vi.fn(),
}));

vi.mock("@main/bootstrap/workspace-window-manager", () => ({
  workspaceWindowManager: {
    getContextByWebContents: mocks.getContextByWebContents,
  },
}));

vi.mock("@main/services/workspace/resolver/workspace-resolver", () => ({
  resolveWorkspace: mocks.resolveWorkspace,
}));

vi.mock("@main/services/insight/guidelines/guidelines-browser-service", () => ({
  getGuidelinesBrowser: mocks.getGuidelinesBrowser,
}));

import { registerGuidelinesHandlers } from "@main/ipc/insight/guidelines";

describe("registerGuidelinesHandlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getContextByWebContents.mockReturnValue({
      role: "workspace",
      workspaceId: "workspace-1",
    });
  });

  function handler(
    channel: string
  ): (event: unknown, input: unknown) => Promise<IpcResponse<unknown>> {
    const call = vi
      .mocked(ipcMain.handle)
      .mock.calls.find(([registeredChannel]) => registeredChannel === channel);
    expect(call).toBeTruthy();
    return call![1] as (event: unknown, input: unknown) => Promise<IpcResponse<unknown>>;
  }

  it("returns guidelines browser data for a resolved Workspace", async () => {
    registerGuidelinesHandlers();
    const workspace = { workspaceId: "workspace-1", primaryFolderId: "folder-a", folders: [] };
    const overview = { folders: [], items: [], completeness: "complete", excludedFolderIds: [] };
    mocks.resolveWorkspace.mockResolvedValue(workspace);
    mocks.getGuidelinesBrowser.mockResolvedValue(overview);

    const result = await handler(GuidelinesChannels.getBrowser)(
      { sender: {} },
      { workspaceId: "workspace-1" }
    );

    expect(mocks.resolveWorkspace).toHaveBeenCalledWith("workspace-1");
    expect(mocks.getGuidelinesBrowser).toHaveBeenCalledWith(workspace);
    expect(result).toEqual({ ok: true, data: overview });
  });

  it("returns WORKSPACE_NOT_FOUND when Workspace cannot be resolved", async () => {
    registerGuidelinesHandlers();
    mocks.resolveWorkspace.mockRejectedValue(
      Object.assign(new Error("Workspace does not exist"), { code: "WORKSPACE_NOT_FOUND" })
    );

    mocks.getContextByWebContents.mockReturnValue({ role: "workspace", workspaceId: "missing" });
    const result = await handler(GuidelinesChannels.getBrowser)(
      { sender: {} },
      { workspaceId: "missing" }
    );

    expect(mocks.getGuidelinesBrowser).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("WORKSPACE_NOT_FOUND");
    }
  });

  it("rejects invalid input", async () => {
    registerGuidelinesHandlers();

    const result = await handler(GuidelinesChannels.getBrowser)(
      { sender: {} },
      { workspaceId: "" }
    );

    expect(mocks.resolveWorkspace).not.toHaveBeenCalled();
    expect(mocks.getGuidelinesBrowser).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_ERROR");
    }
  });

  it("rejects a sender from another Workspace", async () => {
    registerGuidelinesHandlers();
    mocks.getContextByWebContents.mockReturnValue({
      role: "workspace",
      workspaceId: "workspace-2",
    });

    const result = await handler(GuidelinesChannels.getBrowser)(
      { sender: {} },
      { workspaceId: "workspace-1" }
    );

    expect(result.ok).toBe(false);
    expect(mocks.resolveWorkspace).not.toHaveBeenCalled();
  });
});
