import { mount } from "@vue/test-utils";
import { createPinia, getActivePinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ list: vi.fn(), getDetail: vi.fn() }));
vi.mock("@renderer/api/session/spawned-session", () => ({
  spawnedSessionApi: {
    list: mocks.list,
    getDetail: mocks.getDetail,
    onWake: vi.fn(),
  },
}));

import { useSpawnedSessionStore } from "@renderer/stores/session/spawned-session";
import SpawnedSessionBackgroundEntry from "@renderer/features/spawned-session-inspector/ui/SpawnedSessionBackgroundEntry.vue";

const owner = { workspaceId: "workspace-1", parentSessionId: "parent-1" };

describe("SpawnedSessionBackgroundEntry", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    mocks.list.mockReturnValue(new Promise(() => undefined));
    mocks.getDetail.mockResolvedValue({ ok: true, data: { status: "not_found" } });
  });

  it("shows a textual current-parent count and opens the shared detail", async () => {
    const store = useSpawnedSessionStore();
    store.lists = new Map([
      [
        "workspace-1\0parent-1",
        {
          loading: false,
          error: null,
          items: [
            {
              sessionId: "spawn-1",
              agent: { agentId: "agent-1", name: "Agent One" },
              status: "running",
              mode: "background",
              startedAt: "2026-08-08T00:00:00.000Z",
              updatedAt: "2026-08-08T00:00:00.000Z",
              promptPreview: "Inspect code",
            },
          ],
        },
      ],
    ]);
    const wrapper = mount(SpawnedSessionBackgroundEntry, {
      props: owner,
      global: {
        plugins: [getActivePinia()!],
        stubs: {
          UPopover: { template: "<div><slot /><slot name='content' /></div>" },
          Popover: { template: "<div><slot /><slot name='content' /></div>" },
          SpawnedSessionDetailSlideover: true,
        },
      },
    });
    expect(wrapper.text()).toContain("正在运行 1 个后台任务");
    expect(wrapper.text()).toContain("Agent One");
    expect(wrapper.text()).toContain("正在运行");
    await wrapper.get('[data-test="spawned-background-list"] button').trigger("click");
    expect(mocks.getDetail).toHaveBeenCalledWith({ ...owner, sessionId: "spawn-1" });
  });

  it("hides for an empty current-parent scope", () => {
    const wrapper = mount(SpawnedSessionBackgroundEntry, {
      props: owner,
      global: { plugins: [getActivePinia()!] },
    });
    expect(wrapper.find('[data-test="spawned-background-trigger"]').exists()).toBe(false);
  });
});
