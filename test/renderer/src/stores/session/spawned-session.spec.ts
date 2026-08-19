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
    mocks.getDetail.mockResolvedValue({
      ok: true,
      data: { status: "ready", summary: summary(), turns: [] },
    });
  });

  it("keeps list data scoped to the requested parent", async () => {
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
    expect(store.listState("workspace-1", "parent-1").items).toHaveLength(3);
    expect(store.listState("workspace-1", "parent-2").items).toEqual([]);
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
    const releaseList = store.acquireParentListInterest(owner);
    await store.loadParentSessions(owner);
    mocks.list.mockClear();
    await store.handleWake({ ...owner, sessionId: "spawn-1" });
    expect(mocks.list).toHaveBeenCalledTimes(1);
    expect(mocks.getDetail).not.toHaveBeenCalled();
    const detailOwner = { ...owner, sessionId: "spawn-1" };
    await store.loadDetail(detailOwner);
    const releaseDetail = store.acquireDetailInterest(detailOwner);
    await store.loadDetail(detailOwner);
    mocks.getDetail.mockClear();
    await store.handleWake({ ...owner, sessionId: "spawn-1" });
    expect(mocks.getDetail).toHaveBeenCalledTimes(1);
    releaseDetail();
    releaseList();
  });

  it("queues one post-in-flight refresh so a terminal wake cannot be lost", async () => {
    const first = Promise.withResolvers<{
      ok: true;
      data: ReturnType<typeof summary>[];
    }>();
    mocks.list.mockReturnValueOnce(first.promise).mockResolvedValueOnce({
      ok: true,
      data: [summary({ status: "idle" })],
    });
    const store = useSpawnedSessionStore();
    const release = store.acquireParentListInterest(owner);
    const firstRequest = store.loadParentSessions(owner);
    await Promise.resolve();
    expect(mocks.list).toHaveBeenCalledTimes(1);

    const wake = store.handleWake({ ...owner, sessionId: "spawn-1" });
    first.resolve({ ok: true, data: [summary({ status: "running" })] });
    await wake;
    await firstRequest;

    expect(mocks.list).toHaveBeenCalledTimes(2);
    expect(store.listState(owner.workspaceId, owner.parentSessionId).items[0]?.status).toBe("idle");
    release();
  });

  it("shares detail interest and stops detail wake refresh after the last release", async () => {
    const store = useSpawnedSessionStore();
    const detailOwner = { ...owner, sessionId: "spawn-1" };
    const firstRelease = store.acquireDetailInterest(detailOwner);
    const secondRelease = store.acquireDetailInterest(detailOwner);
    await store.loadDetail(detailOwner);
    mocks.getDetail.mockClear();

    firstRelease();
    await store.handleWake(detailOwner);
    expect(mocks.getDetail).toHaveBeenCalledTimes(1);

    secondRelease();
    await store.handleWake(detailOwner);
    expect(mocks.getDetail).toHaveBeenCalledTimes(1);
  });
});
