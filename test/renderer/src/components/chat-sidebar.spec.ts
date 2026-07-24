import { nextTick, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import ChatSidebar from "@renderer/components/chat/ChatSidebar.vue";
import type { Session } from "@shared/types/chat";

const sessionsRef = ref<Session[]>([]);
const activeSessionRef = ref<Session | null>(null);
const beginDraftSession = vi.fn();
const resetChatState = vi.fn();

vi.mock("@renderer/stores", () => ({
  useSessionStore: () => ({
    get sessions() {
      return sessionsRef.value;
    },
    get activeSession() {
      return activeSessionRef.value;
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
    activeSessionRef.value = null;
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
    expect(wrapper.get('[data-test="pinned-session-count"]').text()).toBe("2");
    expect(wrapper.get('[data-test="recent-session-count"]').text()).toBe("2");
    expect(pinned.attributes("data-state")).toBe("open");
    expect(recent.attributes("data-state")).toBe("open");
    expect(pinned.findAll('[data-test^="sidebar-session-"]').map((item) => item.text())).toEqual([
      "pinned-new",
      "pinned-old",
    ]);
    expect(recent.findAll('[data-test^="sidebar-session-"]').map((item) => item.text())).toEqual([
      "recent-new",
      "recent-old",
    ]);
  });

  it("keeps a collapsible recent group when no session is pinned", () => {
    sessionsRef.value = [
      makeSession("recent-old", { updatedAt: "2026-05-11T00:00:00.000Z" }),
      makeSession("recent-new", { updatedAt: "2026-05-12T00:00:00.000Z" }),
    ];

    const wrapper = mountSidebar();

    expect(wrapper.find('[data-test="pinned-session-group"]').exists()).toBe(false);
    expect(wrapper.get('[data-test="recent-session-group"]').text()).toContain("最近会话");
    expect(wrapper.get('[data-test="recent-session-count"]').text()).toBe("2");
    expect(wrapper.get('[data-test="recent-session-group"]').attributes("data-state")).toBe("open");
    expect(wrapper.findAll('[data-test^="sidebar-session-"]').map((item) => item.text())).toEqual([
      "recent-new",
      "recent-old",
    ]);
  });

  it("gives every open group an equal flex share and independent scrolling", () => {
    sessionsRef.value = [makeSession("pinned", { isPinned: true }), makeSession("recent")];

    const wrapper = mountSidebar();

    expect(wrapper.get('[data-test="session-list"]').classes()).toEqual(
      expect.arrayContaining(["flex-1", "min-h-0"])
    );
    expect(wrapper.get('[data-test="pinned-session-group"]').classes()).toEqual(
      expect.arrayContaining(["basis-8", "grow", "min-h-0", "transition-[flex-grow]"])
    );
    expect(wrapper.get('[data-test="recent-session-group"]').classes()).toEqual(
      expect.arrayContaining(["basis-8", "grow", "min-h-0", "transition-[flex-grow]"])
    );
    expect(wrapper.get('[data-test="pinned-session-scroll"]').classes()).toContain(
      "overflow-y-auto"
    );
    expect(wrapper.get('[data-test="recent-session-scroll"]').classes()).toContain(
      "overflow-y-auto"
    );
  });

  it("collapses groups independently while keeping their content mounted", async () => {
    sessionsRef.value = [makeSession("pinned", { isPinned: true }), makeSession("recent")];

    const wrapper = mountSidebar();
    await wrapper.get('[data-test="recent-session-trigger"]').trigger("click");

    expect(wrapper.get('[data-test="recent-session-group"]').attributes("data-state")).toBe(
      "closed"
    );
    expect(wrapper.get('[data-test="recent-session-group"]').classes()).toContain("grow-0");
    expect(wrapper.get('[data-test="recent-session-group"]').classes()).not.toContain("grow");
    expect(wrapper.find('[data-test="recent-session-scroll"]').exists()).toBe(true);
    expect(wrapper.get('[data-test="pinned-session-group"]').attributes("data-state")).toBe("open");
    expect(wrapper.get('[data-test="pinned-session-group"]').classes()).toContain("grow");
  });

  it("opens only the group that gains the active session", async () => {
    const pinned = makeSession("pinned", { isPinned: true });
    const recent = makeSession("recent");
    sessionsRef.value = [pinned, recent];

    const wrapper = mountSidebar();
    await wrapper.get('[data-test="pinned-session-trigger"]').trigger("click");
    await wrapper.get('[data-test="recent-session-trigger"]').trigger("click");

    activeSessionRef.value = pinned;
    await nextTick();

    expect(wrapper.get('[data-test="pinned-session-group"]').attributes("data-state")).toBe("open");
    expect(wrapper.get('[data-test="recent-session-group"]').attributes("data-state")).toBe(
      "closed"
    );
  });

  it("keeps an active group collapsed until the active session enters another group", async () => {
    const pinned = makeSession("pinned", { isPinned: true });
    const active = makeSession("active");
    sessionsRef.value = [pinned, active];
    activeSessionRef.value = active;

    const wrapper = mountSidebar();
    await wrapper.get('[data-test="pinned-session-trigger"]').trigger("click");
    await wrapper.get('[data-test="recent-session-trigger"]').trigger("click");
    activeSessionRef.value = { ...active, title: "updated without changing groups" };
    await nextTick();

    expect(wrapper.get('[data-test="recent-session-group"]').attributes("data-state")).toBe(
      "closed"
    );
    expect(wrapper.get('[data-test="pinned-session-group"]').attributes("data-state")).toBe(
      "closed"
    );

    const movedActive = { ...active, isPinned: true };
    sessionsRef.value = [pinned, movedActive];
    activeSessionRef.value = movedActive;
    await nextTick();

    expect(wrapper.get('[data-test="pinned-session-group"]').attributes("data-state")).toBe("open");
    expect(wrapper.find('[data-test="recent-session-group"]').exists()).toBe(false);
  });

  it("does not open a collapsed target group when a non-active session moves into it", async () => {
    const pinned = makeSession("pinned", { isPinned: true });
    const active = makeSession("active");
    const moving = makeSession("moving");
    sessionsRef.value = [pinned, active, moving];
    activeSessionRef.value = active;

    const wrapper = mountSidebar();
    await wrapper.get('[data-test="pinned-session-trigger"]').trigger("click");

    sessionsRef.value = [pinned, active, { ...moving, isPinned: true }];
    await nextTick();

    expect(wrapper.get('[data-test="pinned-session-group"]').attributes("data-state")).toBe(
      "closed"
    );
    expect(wrapper.get('[data-test="recent-session-group"]').attributes("data-state")).toBe("open");
    expect(wrapper.get('[data-test="pinned-session-count"]').text()).toBe("2");
    expect(wrapper.get('[data-test="recent-session-count"]').text()).toBe("1");
  });
});
