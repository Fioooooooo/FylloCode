import { beforeEach, describe, expect, it, vi } from "vitest";
import { ipcMain } from "electron";
import { SessionActionChannels } from "@shared/ipc/session/action.channels";
import type { IpcResponse } from "@shared/types/ipc";

const mocks = vi.hoisted(() => ({
  getContextByWebContents: vi.fn(),
  registerAction: vi.fn(),
  transitionAction: vi.fn(),
  transitionActions: vi.fn(),
}));

vi.mock("@main/bootstrap/workspace-window-manager", () => ({
  workspaceWindowManager: {
    getContextByWebContents: mocks.getContextByWebContents,
  },
}));

vi.mock("@main/services/session/action/action-service", () => ({
  registerAction: mocks.registerAction,
  transitionAction: mocks.transitionAction,
  transitionActions: mocks.transitionActions,
}));

import { registerSessionActionHandlers } from "@main/ipc/session/action";

describe("registerSessionActionHandlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getContextByWebContents.mockReturnValue({
      role: "workspace",
      workspaceId: "workspace-1",
    });
    mocks.registerAction.mockResolvedValue({
      type: "task.create",
      status: "ready",
      revision: 1,
      updatedAt: "2026-08-02T00:00:00.000Z",
    });
    registerSessionActionHandlers();
  });

  function handler(
    channel: string
  ): (event: unknown, input: unknown) => Promise<IpcResponse<unknown>> {
    const call = vi
      .mocked(ipcMain.handle)
      .mock.calls.slice()
      .reverse()
      .find(([registeredChannel]) => registeredChannel === channel);
    expect(call).toBeTruthy();
    return call![1] as (event: unknown, input: unknown) => Promise<IpcResponse<unknown>>;
  }

  it("accepts an action only from the matching Workspace window", async () => {
    const sender = { id: 11 };
    const input = {
      workspaceId: "workspace-1",
      sessionId: "session-1",
      actionId: "task:session-1:0:0:0",
      type: "task.create",
    };

    const result = await handler(SessionActionChannels.registerAction)({ sender }, input);

    expect(mocks.getContextByWebContents).toHaveBeenCalledWith(sender);
    expect(mocks.registerAction).toHaveBeenCalledWith(input);
    expect(result.ok).toBe(true);
  });

  it("rejects a renderer-supplied workspaceId that differs from sender context", async () => {
    const result = await handler(SessionActionChannels.registerAction)(
      { sender: { id: 12 } },
      {
        workspaceId: "workspace-2",
        sessionId: "session-1",
        actionId: "task:session-1:0:0:0",
        type: "task.create",
      }
    );

    expect(mocks.registerAction).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "WORKSPACE_NOT_FOUND" }),
    });
  });
});
