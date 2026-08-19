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
import SpawnedSessionActivityEntry from "@renderer/features/spawned-session-inspector/ui/SpawnedSessionActivityEntry.vue";

const owner = { workspaceId: "workspace-1", parentSessionId: "parent-1" };

describe("SpawnedSessionActivityEntry", () => {
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
    const wrapper = mount(SpawnedSessionActivityEntry, {
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
    expect(wrapper.text()).toContain("子 Agent 1");
    expect(wrapper.get('[data-test="spawned-activity-trigger"]').attributes("data-icon")).toBe(
      "i-lucide-bot"
    );
    expect(wrapper.text()).toContain("Agent One");
    expect(wrapper.text()).toContain("正在运行");
    await wrapper.get('[data-test="spawned-activity-list"] button').trigger("click");
    expect(mocks.getDetail).toHaveBeenCalledWith({ ...owner, sessionId: "spawn-1" });
  });

  it("shows sync and terminal Sessions after active Sessions", async () => {
    mocks.list.mockResolvedValue({
      ok: true,
      data: [
        {
          sessionId: "terminal",
          agent: { agentId: "agent-2", name: "Terminal Agent" },
          status: "idle",
          mode: "background",
          updatedAt: "2026-08-08T00:03:00.000Z",
        },
        {
          sessionId: "sync-running",
          agent: { agentId: "agent-3", name: "Sync Agent" },
          status: "running",
          mode: "sync",
          updatedAt: "2026-08-08T00:01:00.000Z",
        },
        {
          sessionId: "background-running",
          agent: { agentId: "agent-1", name: "Background Agent" },
          status: "starting",
          mode: "background",
          updatedAt: "2026-08-08T00:02:00.000Z",
        },
      ],
    });
    const wrapper = mount(SpawnedSessionActivityEntry, {
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
    await vi.waitFor(() => expect(wrapper.text()).toContain("子 Agent 3"));

    expect(wrapper.text()).toContain("2 正在运行");
    const names = wrapper
      .findAll('[data-test="spawned-activity-list"] button')
      .map((button) => button.text());
    expect(names[0]).toContain("Background Agent");
    expect(names[1]).toContain("Sync Agent");
    expect(names[2]).toContain("Terminal Agent");
    expect(wrapper.text()).toContain("同步");
    expect(wrapper.text()).toContain("后台");
  });

  it("hides for an empty current-parent scope", () => {
    const wrapper = mount(SpawnedSessionActivityEntry, {
      props: owner,
      global: { plugins: [getActivePinia()!] },
    });
    expect(wrapper.find('[data-test="spawned-activity-trigger"]').exists()).toBe(false);
  });
});
