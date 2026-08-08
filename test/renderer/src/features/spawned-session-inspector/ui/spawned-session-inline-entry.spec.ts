import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getDetail: vi.fn(), list: vi.fn() }));
vi.mock("@renderer/api/session/spawned-session", () => ({
  spawnedSessionApi: {
    getDetail: mocks.getDetail,
    list: mocks.list,
    onWake: vi.fn(),
  },
}));

import SpawnedSessionInlineEntry from "@renderer/features/spawned-session-inspector/ui/SpawnedSessionInlineEntry.vue";

const props = {
  workspaceId: "workspace-1",
  parentSessionId: "parent-1",
  sessionId: "spawn-1",
};

function ready(status: "starting" | "running" | "idle" | "error" | "expired" | "interrupted") {
  return {
    ok: true as const,
    data: {
      status: "ready" as const,
      summary: {
        sessionId: "spawn-1",
        agent: { agentId: "agent-1", name: "Agent One" },
        status,
        updatedAt: "2026-08-08T00:00:00.000Z",
      },
      turns: [],
      messages: [],
    },
  };
}

describe("SpawnedSessionInlineEntry", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it.each([
    ["starting", "正在启动"],
    ["running", "正在运行"],
    ["idle", "已完成"],
    ["error", "运行失败"],
    ["expired", "已失效"],
    ["interrupted", "已中断"],
  ] as const)("renders authoritative %s status with text", async (status, label) => {
    mocks.getDetail.mockResolvedValue(ready(status));
    const wrapper = mount(SpawnedSessionInlineEntry, {
      props,
      global: { plugins: [createPinia()], stubs: { SpawnedSessionDetailSlideover: true } },
    });
    await flushPromises();
    expect(wrapper.get("button").text()).toContain("Agent One");
    expect(wrapper.get("button").text()).toContain(label);
  });

  it("shows query error and not_found without trusting payload display fields", async () => {
    mocks.getDetail.mockResolvedValueOnce({
      ok: false,
      error: { code: "IPC_ERROR", message: "offline" },
    });
    const failed = mount(SpawnedSessionInlineEntry, {
      props,
      global: { plugins: [createPinia()], stubs: { SpawnedSessionDetailSlideover: true } },
    });
    await flushPromises();
    expect(failed.text()).toContain("Session 查询失败");

    mocks.getDetail.mockResolvedValueOnce({ ok: true, data: { status: "not_found" } });
    const missing = mount(SpawnedSessionInlineEntry, {
      props,
      global: { plugins: [createPinia()], stubs: { SpawnedSessionDetailSlideover: true } },
    });
    await flushPromises();
    expect(missing.get("button").attributes("disabled")).toBeDefined();
    expect(missing.text()).toContain("Session 信息不可用");
  });
});
