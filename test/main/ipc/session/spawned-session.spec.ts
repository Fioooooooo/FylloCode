import { beforeEach, describe, expect, it, vi } from "vitest";
import { ipcMain } from "electron";
import { SpawnedSessionChannels } from "@shared/ipc/session/spawned-session.channels";

const mocks = vi.hoisted(() => ({
  requireWorkspaceSender: vi.fn(),
  assertSessionBelongsToWorkspace: vi.fn(),
  list: vi.fn(),
  getDetail: vi.fn(),
  setViewWakeHandler: vi.fn(),
}));

vi.mock("@main/ipc/_kit/workspace-scope", () => ({
  requireWorkspaceSender: mocks.requireWorkspaceSender,
}));
vi.mock("@main/services/session/chat/chat-service", () => ({
  assertSessionBelongsToWorkspace: mocks.assertSessionBelongsToWorkspace,
}));
vi.mock("@main/services/session/spawn/spawned-session-query-service", () => ({
  spawnedSessionQueryService: {
    listSpawnedSessions: mocks.list,
    getSpawnedSessionDetail: mocks.getDetail,
  },
}));
vi.mock("@main/services/session/spawn/spawned-session-manager", () => ({
  spawnedSessionManager: { setViewWakeHandler: mocks.setViewWakeHandler },
}));

import {
  registerSpawnedSessionHandlers,
  setupSpawnedSessionViewBroadcast,
} from "@main/ipc/session/spawned-session";

function handler(channel: string): (event: unknown, input: unknown) => unknown {
  const call = vi.mocked(ipcMain.handle).mock.calls.find(([name]) => name === channel);
  expect(call).toBeTruthy();
  return call![1] as (event: unknown, input: unknown) => unknown;
}

describe("spawned Session inspection IPC", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertSessionBelongsToWorkspace.mockResolvedValue(undefined);
    mocks.list.mockResolvedValue([]);
    mocks.getDetail.mockResolvedValue({ status: "not_found" });
    registerSpawnedSessionHandlers();
  });

  it("validates the sender and trusted parent before querying", async () => {
    const sender = {};
    await handler(SpawnedSessionChannels.list)(
      { sender },
      { workspaceId: "workspace-1", parentSessionId: "parent-1" }
    );
    expect(mocks.requireWorkspaceSender).toHaveBeenCalledWith(sender, "workspace-1");
    expect(mocks.assertSessionBelongsToWorkspace).toHaveBeenCalledWith("workspace-1", "parent-1");
    expect(mocks.list).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      parentSessionId: "parent-1",
    });
  });

  it("returns uniform not_found after a parent disappears", async () => {
    mocks.assertSessionBelongsToWorkspace.mockRejectedValue(new Error("deleted"));
    const result = await handler(SpawnedSessionChannels.getDetail)(
      { sender: {} },
      { workspaceId: "workspace-1", parentSessionId: "parent-1", sessionId: "spawn-1" }
    );
    expect(result).toEqual({ ok: true, data: { status: "not_found" } });
    expect(mocks.getDetail).not.toHaveBeenCalled();
  });

  it("rejects extra caller-provided authorization fields", async () => {
    const result = await handler(SpawnedSessionChannels.getDetail)(
      { sender: {} },
      {
        workspaceId: "workspace-1",
        parentSessionId: "parent-1",
        sessionId: "spawn-1",
        agentId: "fake",
      }
    );
    expect(result).toMatchObject({ ok: false });
    expect(mocks.getDetail).not.toHaveBeenCalled();
  });

  it("broadcasts view wakes only through the dedicated Workspace channel", () => {
    const sendToWorkspace = vi.fn();
    setupSpawnedSessionViewBroadcast({ sendToWorkspace } as never);
    const wake = mocks.setViewWakeHandler.mock.calls.at(-1)?.[0];
    const payload = {
      workspaceId: "workspace-1",
      parentSessionId: "parent-1",
      sessionId: "spawn-1",
    };
    wake(payload);
    expect(sendToWorkspace).toHaveBeenCalledWith(
      "workspace-1",
      SpawnedSessionChannels.wake,
      payload
    );
    expect(SpawnedSessionChannels.wake).not.toContain("spawn-notifications");
  });
});
