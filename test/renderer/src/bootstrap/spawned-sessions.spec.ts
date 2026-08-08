import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import type { Router } from "vue-router";
import { nextTick } from "vue";
import { workspaceInfo } from "../fixtures/workspace";

const mocks = vi.hoisted(() => ({ onWake: vi.fn(), list: vi.fn(), getDetail: vi.fn() }));
vi.mock("@renderer/api/session/spawned-session", () => ({
  spawnedSessionApi: {
    onWake: mocks.onWake,
    list: mocks.list,
    getDetail: mocks.getDetail,
  },
}));
vi.mock("@renderer/api/workspace/workspace", () => ({
  workspaceApi: { list: vi.fn(async () => ({ ok: true, data: [] })) },
}));

describe("spawned Session bootstrap", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.onWake.mockReturnValue(vi.fn());
    mocks.list.mockResolvedValue({ ok: true, data: [] });
  });

  it("registers a pull-only wake listener without preloading", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const { useWorkspaceStore } = await import("@renderer/stores");
    useWorkspaceStore(pinia).currentWorkspace = workspaceInfo({ id: "workspace-1" });
    const { registerSpawnedSessionsTask } =
      await import("@renderer/bootstrap/tasks/spawned-sessions");
    const { runBootstrapTasks } = await import("@renderer/bootstrap/core");
    registerSpawnedSessionsTask();
    await runBootstrapTasks({ pinia, router: {} as Router });
    expect(mocks.list).not.toHaveBeenCalled();
    const wake = mocks.onWake.mock.calls.at(-1)?.[0];
    wake({ workspaceId: "workspace-1", parentSessionId: "parent-1", sessionId: "spawn-1" });
    wake({ workspaceId: "workspace-2", parentSessionId: "parent-2", sessionId: "spawn-2" });
    await vi.waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(1));
  });

  it("cleans the listener and old Workspace cache on re-registration/switch", async () => {
    const cleanup = vi.fn();
    mocks.onWake.mockReturnValue(cleanup);
    const pinia = createPinia();
    setActivePinia(pinia);
    const { useSpawnedSessionStore, useWorkspaceStore } = await import("@renderer/stores");
    const workspaceStore = useWorkspaceStore(pinia);
    workspaceStore.currentWorkspace = workspaceInfo({ id: "workspace-1" });
    const spawnedStore = useSpawnedSessionStore(pinia);
    const reset = vi.spyOn(spawnedStore, "resetWorkspace");
    const { registerSpawnedSessionsTask } =
      await import("@renderer/bootstrap/tasks/spawned-sessions");
    const { runBootstrapTasks } = await import("@renderer/bootstrap/core");
    registerSpawnedSessionsTask();
    await runBootstrapTasks({ pinia, router: {} as Router });
    workspaceStore.currentWorkspace = workspaceInfo({ id: "workspace-2" });
    await nextTick();
    expect(reset).toHaveBeenCalledWith("workspace-1");
    await runBootstrapTasks({ pinia, router: {} as Router });
    expect(cleanup).toHaveBeenCalledOnce();
  });
});
