import { beforeEach, describe, expect, it, vi } from "vitest";
import { InsightOverviewChannels } from "@shared/ipc/insight/overview.channels";
import { InsightSpecsChannels } from "@shared/ipc/insight/specs.channels";

const mocks = vi.hoisted(() => ({
  ipcRenderer: {
    invoke: vi.fn(),
  },
}));

vi.mock("electron", () => ({ ipcRenderer: mocks.ipcRenderer }));

describe("preload repository aggregate APIs", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("forwards only workspaceId for Specs aggregate reads", async () => {
    const aggregate = {
      folders: [],
      items: [],
      completeness: "complete",
      excludedFolderIds: [],
    };
    mocks.ipcRenderer.invoke.mockResolvedValue({ ok: true, data: aggregate });
    const { specsApi } = await import("@preload/api/insight/specs");

    await expect(specsApi.getSpecsBrowser("workspace-1")).resolves.toEqual({
      ok: true,
      data: aggregate,
    });
    expect(mocks.ipcRenderer.invoke).toHaveBeenCalledWith(InsightSpecsChannels.getSpecsBrowser, {
      workspaceId: "workspace-1",
    });
  });

  it("forwards only workspaceId for Overview aggregate reads", async () => {
    const overview = {
      repository: {
        folders: [],
        items: [],
        completeness: "partial",
        excludedFolderIds: ["folder-b"],
      },
    };
    mocks.ipcRenderer.invoke.mockResolvedValue({ ok: true, data: overview });
    const { overviewApi } = await import("@preload/api/insight/overview");

    await expect(overviewApi.getProjectOverview("workspace-1")).resolves.toEqual({
      ok: true,
      data: overview,
    });
    expect(mocks.ipcRenderer.invoke).toHaveBeenCalledWith(
      InsightOverviewChannels.getProjectOverview,
      { workspaceId: "workspace-1" }
    );
  });
});
