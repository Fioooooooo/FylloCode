import { beforeEach, describe, expect, it, vi } from "vitest";
import { ipcMain } from "electron";
import { InsightSpecsChannels } from "@shared/ipc/insight/specs.channels";
import type { IpcResponse } from "@shared/types/ipc";

const mocks = vi.hoisted(() => ({
  getContextByWebContents: vi.fn(),
  resolveWorkspace: vi.fn(),
  getSpecsBrowser: vi.fn(),
}));

vi.mock("@main/bootstrap/workspace-window-manager", () => ({
  workspaceWindowManager: {
    getContextByWebContents: mocks.getContextByWebContents,
  },
}));

vi.mock("@main/services/workspace/_public", () => ({
  resolveWorkspace: mocks.resolveWorkspace,
}));

vi.mock("@main/services/insight/specs/specs-browser-service", () => ({
  getSpecsBrowser: mocks.getSpecsBrowser,
}));

import { registerSpecsHandlers } from "@main/ipc/insight/specs";

describe("registerSpecsHandlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getContextByWebContents.mockReturnValue({
      role: "workspace",
      workspaceId: "workspace-1",
    });
  });

  function handler(): (event: unknown, input: unknown) => Promise<IpcResponse<unknown>> {
    const call = vi
      .mocked(ipcMain.handle)
      .mock.calls.slice()
      .reverse()
      .find(([channel]) => channel === InsightSpecsChannels.getSpecsBrowser);
    expect(call).toBeTruthy();
    return call![1] as (event: unknown, input: unknown) => Promise<IpcResponse<unknown>>;
  }

  it("passes the resolved Workspace to the specs aggregate", async () => {
    registerSpecsHandlers();
    const workspace = { workspaceId: "workspace-1", primaryFolderId: "folder-a", folders: [] };
    const overview = {
      folders: [],
      items: [],
      completeness: "complete",
      excludedFolderIds: [],
    };
    mocks.resolveWorkspace.mockResolvedValue(workspace);
    mocks.getSpecsBrowser.mockResolvedValue(overview);

    const result = await handler()({ sender: {} }, { workspaceId: "workspace-1" });

    expect(mocks.resolveWorkspace).toHaveBeenCalledWith("workspace-1");
    expect(mocks.getSpecsBrowser).toHaveBeenCalledWith(workspace);
    expect(result).toEqual({ ok: true, data: overview });
  });

  it("rejects a sender from another Workspace before resolving", async () => {
    registerSpecsHandlers();
    mocks.getContextByWebContents.mockReturnValue({
      role: "workspace",
      workspaceId: "workspace-2",
    });

    const result = await handler()({ sender: {} }, { workspaceId: "workspace-1" });

    expect(result.ok).toBe(false);
    expect(mocks.resolveWorkspace).not.toHaveBeenCalled();
  });
});
