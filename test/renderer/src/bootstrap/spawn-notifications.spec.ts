import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import type { Router } from "vue-router";
import { workspaceInfo } from "../fixtures/workspace";

const mocks = vi.hoisted(() => ({
  onWake: vi.fn(),
}));

vi.mock("@renderer/api/session/chat", () => ({
  chatApi: {
    onSpawnNotificationsWake: mocks.onWake,
    listSpawnNotifications: vi.fn(async () => ({ ok: true, data: [] })),
    dispatchSpawnNotification: vi.fn(),
    onProbeUpdate: vi.fn(() => vi.fn()),
  },
}));

vi.mock("@renderer/api/workspace/workspace", () => ({
  workspaceApi: {
    list: vi.fn(async () => ({ ok: true, data: [] })),
  },
}));

describe("spawn notification bootstrap", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.onWake.mockReturnValue(vi.fn());
  });

  it("启动时主动 pull，wake 只触发当前 Workspace 再次 pull", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const { useChatStore, useWorkspaceStore } = await import("@renderer/stores");
    useWorkspaceStore(pinia).currentWorkspace = workspaceInfo({ id: "workspace-1" });
    const chatStore = useChatStore(pinia);
    const drain = vi.spyOn(chatStore, "requestSpawnNotificationDrain").mockResolvedValue();
    const { registerSpawnNotificationsTask } =
      await import("@renderer/bootstrap/tasks/spawn-notifications");
    const { runBootstrapTasks } = await import("@renderer/bootstrap/core");
    registerSpawnNotificationsTask();

    await runBootstrapTasks({ pinia, router: {} as Router });
    expect(drain).toHaveBeenCalledWith("workspace-1");
    const wake = mocks.onWake.mock.calls.at(-1)?.[0];
    expect(wake).toBeTypeOf("function");

    wake({ workspaceId: "workspace-1" });
    wake({ workspaceId: "workspace-2" });
    expect(drain).toHaveBeenCalledTimes(2);
    expect(drain).toHaveBeenLastCalledWith("workspace-1");
  });

  it("重新注册 scope 时销毁旧 listener", async () => {
    const cleanup = vi.fn();
    mocks.onWake.mockReturnValue(cleanup);
    const pinia = createPinia();
    setActivePinia(pinia);
    const { useWorkspaceStore } = await import("@renderer/stores");
    useWorkspaceStore(pinia).currentWorkspace = workspaceInfo({ id: "workspace-1" });
    const { registerSpawnNotificationsTask } =
      await import("@renderer/bootstrap/tasks/spawn-notifications");
    const { runBootstrapTasks } = await import("@renderer/bootstrap/core");
    registerSpawnNotificationsTask();

    await runBootstrapTasks({ pinia, router: {} as Router });
    useWorkspaceStore(pinia).currentWorkspace = workspaceInfo({ id: "workspace-2" });
    await runBootstrapTasks({ pinia, router: {} as Router });

    expect(cleanup).toHaveBeenCalledOnce();
  });
});
