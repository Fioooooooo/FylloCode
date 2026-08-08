import { beforeEach, describe, expect, it, vi } from "vitest";
import { SpawnedSessionChannels } from "@shared/ipc/session/spawned-session.channels";

const mocks = vi.hoisted(() => ({
  ipcRenderer: { invoke: vi.fn(), on: vi.fn(), off: vi.fn() },
}));

vi.mock("electron", () => ({ ipcRenderer: mocks.ipcRenderer }));

describe("preload spawnedSessionApi", () => {
  beforeEach(() => vi.clearAllMocks());

  it("invokes owner-scoped list and detail channels", async () => {
    const { spawnedSessionApi } = await import("@preload/api/session/spawned-session");
    const owner = { workspaceId: "workspace-1", parentSessionId: "parent-1" };
    await spawnedSessionApi.list(owner);
    await spawnedSessionApi.getDetail({ ...owner, sessionId: "spawn-1" });
    expect(mocks.ipcRenderer.invoke).toHaveBeenNthCalledWith(1, SpawnedSessionChannels.list, owner);
    expect(mocks.ipcRenderer.invoke).toHaveBeenNthCalledWith(2, SpawnedSessionChannels.getDetail, {
      ...owner,
      sessionId: "spawn-1",
    });
    expect(mocks.ipcRenderer.invoke.mock.calls.flat()).not.toContain("responsePath");
  });

  it("tears down wake listeners idempotently", async () => {
    const { spawnedSessionApi } = await import("@preload/api/session/spawned-session");
    const handler = vi.fn();
    const stop = spawnedSessionApi.onWake(handler);
    const listener = mocks.ipcRenderer.on.mock.calls[0]?.[1];
    listener({}, { workspaceId: "workspace-1", parentSessionId: "parent-1", sessionId: "spawn-1" });
    stop();
    stop();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(mocks.ipcRenderer.off).toHaveBeenCalledTimes(1);
    expect(mocks.ipcRenderer.off).toHaveBeenCalledWith(SpawnedSessionChannels.wake, listener);
  });
});
