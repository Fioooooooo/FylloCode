import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

const mocks = vi.hoisted(() => ({ list: vi.fn(), getDetail: vi.fn() }));
vi.mock("@renderer/api/session/spawned-session", () => ({
  spawnedSessionApi: { list: mocks.list, getDetail: mocks.getDetail, onWake: vi.fn() },
}));

import { useSpawnedSessionStore } from "@renderer/stores/session/spawned-session";

const owner = { workspaceId: "workspace-1", parentSessionId: "parent-1" };
const summary = (overrides: Record<string, unknown> = {}) => ({
  sessionId: "spawn-1",
  agent: { agentId: "agent-1", name: "Agent One" },
  status: "running" as const,
  mode: "background" as const,
  updatedAt: "2026-08-08T00:00:00.000Z",
  ...overrides,
});

describe("useSpawnedSessionStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    mocks.list.mockResolvedValue({ ok: true, data: [] });
    mocks.getDetail.mockResolvedValue({ ok: true, data: { status: "not_found" } });
  });

  it("filters only active background entries in the requested parent scope", async () => {
    mocks.list.mockResolvedValue({
      ok: true,
      data: [
        summary(),
        summary({ sessionId: "sync", mode: "sync" }),
        summary({ sessionId: "idle", status: "idle" }),
      ],
    });
    const store = useSpawnedSessionStore();
    await store.loadParentSessions(owner);
    expect(store.activeBackgroundForParent("workspace-1", "parent-1")).toEqual([
      expect.objectContaining({ sessionId: "spawn-1" }),
    ]);
    expect(store.activeBackgroundForParent("workspace-1", "parent-2")).toEqual([]);
  });

  it("merges duplicate in-flight list and detail reads", async () => {
    const listPending = Promise.withResolvers<{ ok: true; data: [] }>();
    const detailPending = Promise.withResolvers<{
      ok: true;
      data: { status: "not_found" };
    }>();
    mocks.list.mockReturnValue(listPending.promise);
    mocks.getDetail.mockReturnValue(detailPending.promise);
    const store = useSpawnedSessionStore();
    const firstList = store.loadParentSessions(owner);
    const secondList = store.loadParentSessions(owner);
    const detailOwner = { ...owner, sessionId: "spawn-1" };
    const firstDetail = store.loadDetail(detailOwner);
    const secondDetail = store.loadDetail(detailOwner);
    expect(mocks.list).toHaveBeenCalledTimes(1);
    expect(mocks.getDetail).toHaveBeenCalledTimes(1);
    listPending.resolve({ ok: true, data: [] });
    detailPending.resolve({ ok: true, data: { status: "not_found" } });
    await Promise.all([firstList, secondList, firstDetail, secondDetail]);
  });

  it("drops late responses after Workspace reset", async () => {
    const pending = Promise.withResolvers<{
      ok: true;
      data: ReturnType<typeof summary>[];
    }>();
    mocks.list.mockReturnValue(pending.promise);
    const store = useSpawnedSessionStore();
    const request = store.loadParentSessions(owner);
    store.resetWorkspace("workspace-1");
    pending.resolve({ ok: true, data: [summary()] });
    await request;
    expect(store.listState("workspace-1", "parent-1").items).toEqual([]);
  });

  it("wake refreshes list and only an already-observed detail", async () => {
    const store = useSpawnedSessionStore();
    await store.handleWake({ ...owner, sessionId: "spawn-1" });
    expect(mocks.list).toHaveBeenCalledTimes(1);
    expect(mocks.getDetail).not.toHaveBeenCalled();
    await store.loadDetail({ ...owner, sessionId: "spawn-1" });
    await store.handleWake({ ...owner, sessionId: "spawn-1" });
    expect(mocks.getDetail).toHaveBeenCalledTimes(2);
  });
});
