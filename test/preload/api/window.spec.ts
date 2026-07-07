import { beforeEach, describe, expect, it, vi } from "vitest";
import { WindowChannels } from "@shared/types/channels";

const mocks = vi.hoisted(() => ({
  ipcRenderer: {
    invoke: vi.fn(),
  },
}));

vi.mock("electron", () => ({
  ipcRenderer: mocks.ipcRenderer,
}));

describe("preload windowApi", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.ipcRenderer.invoke.mockResolvedValue({ ok: true, data: null });
  });

  it("invokes getContext without payload", async () => {
    const { windowApi } = await import("@preload/api/window");

    await windowApi.getContext();

    expect(mocks.ipcRenderer.invoke).toHaveBeenCalledWith(WindowChannels.getContext);
  });

  it("invokes openProject with projectId", async () => {
    const { windowApi } = await import("@preload/api/window");

    await windowApi.openProject("project-1");

    expect(mocks.ipcRenderer.invoke).toHaveBeenCalledWith(WindowChannels.openProject, {
      projectId: "project-1",
    });
  });

  it("invokes openFolder without payload", async () => {
    const { windowApi } = await import("@preload/api/window");

    await windowApi.openFolder();

    expect(mocks.ipcRenderer.invoke).toHaveBeenCalledWith(WindowChannels.openFolder);
  });

  it("invokes openLauncher without payload", async () => {
    const { windowApi } = await import("@preload/api/window");

    await windowApi.openLauncher();

    expect(mocks.ipcRenderer.invoke).toHaveBeenCalledWith(WindowChannels.openLauncher);
  });
});
