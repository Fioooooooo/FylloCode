import { beforeEach, describe, expect, it, vi } from "vitest";
import { spawnedSessionApi } from "@renderer/api/session/spawned-session";

describe("renderer spawnedSessionApi", () => {
  beforeEach(() => {
    window.api = {
      session: {
        spawnedSession: { list: vi.fn(), getDetail: vi.fn(), onWake: vi.fn() },
      },
    } as never;
  });

  it("delegates only typed owner-scoped reads and wake subscription", async () => {
    const owner = { workspaceId: "workspace-1", parentSessionId: "parent-1" };
    await spawnedSessionApi.list(owner);
    await spawnedSessionApi.getDetail({ ...owner, sessionId: "spawn-1" });
    const handler = vi.fn();
    spawnedSessionApi.onWake(handler);
    expect(window.api.session.spawnedSession.list).toHaveBeenCalledWith(owner);
    expect(window.api.session.spawnedSession.getDetail).toHaveBeenCalledWith({
      ...owner,
      sessionId: "spawn-1",
    });
    expect(window.api.session.spawnedSession.onWake).toHaveBeenCalledWith(handler);
  });
});
