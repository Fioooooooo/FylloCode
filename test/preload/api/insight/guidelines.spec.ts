import { beforeEach, describe, expect, it, vi } from "vitest";
import { InsightGuidelinesChannels as GuidelinesChannels } from "@shared/ipc/insight/guidelines.channels";

const mocks = vi.hoisted(() => ({
  ipcRenderer: {
    invoke: vi.fn(),
  },
}));

vi.mock("electron", () => ({
  ipcRenderer: mocks.ipcRenderer,
}));

describe("preload guidelinesApi", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.ipcRenderer.invoke.mockResolvedValue({ ok: true, data: { items: [] } });
  });

  it("invokes guidelines browser channel with projectId", async () => {
    const { guidelinesApi } = await import("@preload/api/insight/guidelines");

    await guidelinesApi.getBrowser("project-1");

    expect(mocks.ipcRenderer.invoke).toHaveBeenCalledWith(GuidelinesChannels.getBrowser, {
      projectId: "project-1",
    });
  });
});
