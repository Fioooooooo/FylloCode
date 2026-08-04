import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlatformLifecycleChannels } from "@shared/ipc/platform/lifecycle.channels";

const send = vi.hoisted(() => vi.fn());
vi.mock("electron", () => ({ ipcRenderer: { send } }));

describe("preload lifecycleApi", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sends the renderer interactive signal without payload", async () => {
    const { lifecycleApi } = await import("@preload/api/platform/lifecycle");

    lifecycleApi.markInteractive();

    expect(send).toHaveBeenCalledWith(PlatformLifecycleChannels.rendererInteractive);
  });
});
