import { beforeEach, describe, expect, it, vi } from "vitest";
import { ipcMain } from "electron";
import { InsightGuidelinesChannels as GuidelinesChannels } from "@shared/ipc/insight/guidelines.channels";
import type { IpcResponse } from "@shared/types/ipc";

const mocks = vi.hoisted(() => ({
  loadProject: vi.fn(),
  getGuidelinesBrowser: vi.fn(),
}));

vi.mock("@main/infra/storage/project-store", () => ({
  loadProject: mocks.loadProject,
}));

vi.mock("@main/services/insight/guidelines/guidelines-browser-service", () => ({
  getGuidelinesBrowser: mocks.getGuidelinesBrowser,
}));

import { registerGuidelinesHandlers } from "@main/ipc/insight/guidelines";

describe("registerGuidelinesHandlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it("returns guidelines browser data for a resolved project", async () => {
    registerGuidelinesHandlers();
    mocks.loadProject.mockResolvedValue({ id: "project-1", path: "/tmp/project" });
    mocks.getGuidelinesBrowser.mockResolvedValue({
      items: [{ path: "guidelines/Architecture.md", name: "Architecture" }],
    });

    const result = await handler(GuidelinesChannels.getBrowser)({}, { projectId: "project-1" });

    expect(mocks.loadProject).toHaveBeenCalledWith("project-1");
    expect(mocks.getGuidelinesBrowser).toHaveBeenCalledWith("/tmp/project");
    expect(result).toEqual({
      ok: true,
      data: {
        items: [{ path: "guidelines/Architecture.md", name: "Architecture" }],
      },
    });
  });

  it("returns PROJECT_NOT_FOUND when project cannot be resolved", async () => {
    registerGuidelinesHandlers();
    mocks.loadProject.mockResolvedValue(null);

    const result = await handler(GuidelinesChannels.getBrowser)({}, { projectId: "missing" });

    expect(mocks.getGuidelinesBrowser).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("PROJECT_NOT_FOUND");
    }
  });

  it("rejects invalid input", async () => {
    registerGuidelinesHandlers();

    const result = await handler(GuidelinesChannels.getBrowser)({}, { projectId: "" });

    expect(mocks.loadProject).not.toHaveBeenCalled();
    expect(mocks.getGuidelinesBrowser).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_ERROR");
    }
  });
});
