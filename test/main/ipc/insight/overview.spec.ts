import { beforeEach, describe, expect, it, vi } from "vitest";
import { ipcMain } from "electron";
import { InsightOverviewChannels } from "@shared/ipc/insight/overview.channels";
import type { IpcResponse } from "@shared/types/ipc";

const mocks = vi.hoisted(() => ({
  getContextByWebContents: vi.fn(),
  getProjectOverview: vi.fn(),
}));

vi.mock("@main/bootstrap/workspace-window-manager", () => ({
  workspaceWindowManager: {
    getContextByWebContents: mocks.getContextByWebContents,
  },
}));
vi.mock("@main/services/insight/overview/overview-service", () => ({
  getProjectOverview: mocks.getProjectOverview,
}));

import { registerOverviewHandlers } from "@main/ipc/insight/overview";

describe("overview IPC", () => {
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
      .find(([channel]) => channel === InsightOverviewChannels.getProjectOverview);
    expect(call).toBeTruthy();
    return call![1] as (event: unknown, input: unknown) => Promise<IpcResponse<unknown>>;
  }

  it("passes Workspace identity without resolving a primary cwd", async () => {
    registerOverviewHandlers();
    mocks.getProjectOverview.mockResolvedValue({ repository: { completeness: "complete" } });

    const result = await handler()({ sender: {} }, { workspaceId: "workspace-1" });

    expect(mocks.getProjectOverview).toHaveBeenCalledWith("workspace-1");
    expect(result.ok).toBe(true);
  });

  it("rejects a sender from another Workspace", async () => {
    registerOverviewHandlers();
    mocks.getContextByWebContents.mockReturnValue({
      role: "workspace",
      workspaceId: "workspace-2",
    });

    const result = await handler()({ sender: {} }, { workspaceId: "workspace-1" });

    expect(result.ok).toBe(false);
    expect(mocks.getProjectOverview).not.toHaveBeenCalled();
  });
});
