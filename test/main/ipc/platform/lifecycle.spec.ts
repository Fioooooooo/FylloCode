import { beforeEach, describe, expect, it, vi } from "vitest";
import { ipcMain } from "electron";
import { PlatformLifecycleChannels } from "@shared/ipc/platform/lifecycle.channels";

const markRendererInteractive = vi.hoisted(() => vi.fn());
vi.mock("@main/services/platform/lifecycle/renderer-readiness", () => ({
  markRendererInteractive,
}));

describe("platform lifecycle IPC", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes the sender to the formal-renderer validator", async () => {
    const { registerLifecycleHandlers } = await import("@main/ipc/platform/lifecycle");
    registerLifecycleHandlers();
    const registration = vi
      .mocked(ipcMain.on)
      .mock.calls.find(([channel]) => channel === PlatformLifecycleChannels.rendererInteractive);
    expect(registration).toBeTruthy();
    const sender = { id: 12 };

    registration![1]({ sender } as never);

    expect(markRendererInteractive).toHaveBeenCalledWith(sender);
  });
});
