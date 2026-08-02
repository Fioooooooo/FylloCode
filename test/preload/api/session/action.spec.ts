import { beforeEach, describe, expect, it, vi } from "vitest";
import { SessionActionChannels } from "@shared/ipc/session/action.channels";

const mocks = vi.hoisted(() => ({
  ipcRenderer: { invoke: vi.fn() },
}));

vi.mock("electron", () => ({ ipcRenderer: mocks.ipcRenderer }));

describe("preload sessionActionApi", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.ipcRenderer.invoke.mockResolvedValue({ ok: true, data: null });
  });

  it("forwards workspaceId when registering an action", async () => {
    const { sessionActionApi } = await import("@preload/api/session/action");
    const input = {
      workspaceId: "workspace-1",
      sessionId: "session-1",
      actionId: "task:session-1:0:0:0",
      type: "task.create" as const,
    };

    await sessionActionApi.registerAction(input);

    expect(mocks.ipcRenderer.invoke).toHaveBeenCalledWith(
      SessionActionChannels.registerAction,
      input
    );
  });
});
