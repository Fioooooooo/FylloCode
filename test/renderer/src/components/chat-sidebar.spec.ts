import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import ChatSidebar from "@renderer/components/chat/ChatSidebar.vue";
import type { Session } from "@shared/types/chat";

const sessionsRef = ref<Session[]>([]);
const beginDraftSession = vi.fn();
const resetChatState = vi.fn();

vi.mock("@renderer/stores", () => ({
  useSessionStore: () => ({
    get sessions() {
      return sessionsRef.value;
    },
    beginDraftSession,
  }),
  useChatStore: () => ({
    resetChatState,
  }),
}));

function makeSession(
  id: string,
  options: { isPinned?: boolean; updatedAt?: string } = {}
): Session {
  const timestamp = new Date(options.updatedAt ?? "2026-05-12T00:00:00.000Z");
  return {
    id,
    projectId: "project-1",
    agentId: "claude-code",
    title: id,
    isPinned: options.isPinned ?? false,
    status: "ended",
    turnCount: 0,
    tokenUsage: { used: 0, size: 0 },
    createdAt: timestamp,
    updatedAt: timestamp,
    messages: [],
  };
}

function mountSidebar() {
  return mount(ChatSidebar, {
    global: {
      stubs: {
        SessionItem: {
          props: ["session"],
          template: '<div :data-test="`sidebar-session-${session.id}`">{{ session.title }}</div>',
        },
      },
    },
  });
}

describe("ChatSidebar", () => {
  beforeEach(() => {
    sessionsRef.value = [];
    beginDraftSession.mockReset();
    resetChatState.mockReset();
  });

  it("separates pinned and recent sessions and sorts each group by activity", () => {
    sessionsRef.value = [
      makeSession("pinned-old", { isPinned: true, updatedAt: "2026-05-12T00:00:00.000Z" }),
      makeSession("recent-new", { updatedAt: "2026-05-15T00:00:00.000Z" }),
      makeSession("pinned-new", { isPinned: true, updatedAt: "2026-05-16T00:00:00.000Z" }),
      makeSession("recent-old", { updatedAt: "2026-05-11T00:00:00.000Z" }),
    ];

    const wrapper = mountSidebar();
    const pinned = wrapper.get('[data-test="pinned-session-group"]');
    const recent = wrapper.get('[data-test="recent-session-group"]');

    expect(pinned.text()).toContain("置顶会话");
    expect(recent.text()).toContain("最近会话");
    expect(pinned.findAll('[data-test^="sidebar-session-"]').map((item) => item.text())).toEqual([
      "pinned-new",
      "pinned-old",
    ]);
    expect(recent.findAll('[data-test^="sidebar-session-"]').map((item) => item.text())).toEqual([
      "recent-new",
      "recent-old",
    ]);
  });

  it("keeps the original ungrouped list when no session is pinned", () => {
    sessionsRef.value = [
      makeSession("recent-old", { updatedAt: "2026-05-11T00:00:00.000Z" }),
      makeSession("recent-new", { updatedAt: "2026-05-12T00:00:00.000Z" }),
    ];

    const wrapper = mountSidebar();

    expect(wrapper.find('[data-test="pinned-session-group"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="recent-session-group"]').exists()).toBe(false);
    expect(wrapper.findAll('[data-test^="sidebar-session-"]').map((item) => item.text())).toEqual([
      "recent-new",
      "recent-old",
    ]);
  });

  it("caps the pinned group and keeps both groups independently scrollable", () => {
    sessionsRef.value = [makeSession("pinned", { isPinned: true }), makeSession("recent")];

    const wrapper = mountSidebar();

    expect(wrapper.get('[data-test="session-list"]').classes()).toEqual(
      expect.arrayContaining(["flex-1", "min-h-0"])
    );
    expect(wrapper.get('[data-test="pinned-session-group"]').classes()).toContain("max-h-1/2");
    expect(wrapper.get('[data-test="pinned-session-scroll"]').classes()).toContain(
      "overflow-y-auto"
    );
    expect(wrapper.get('[data-test="recent-session-scroll"]').classes()).toContain(
      "overflow-y-auto"
    );
  });
});
