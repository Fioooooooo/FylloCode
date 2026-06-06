import { computed, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import SessionItem from "@renderer/components/chat/SessionItem.vue";
import type { Session } from "@shared/types/chat";

const activeSessionIdRef = ref<string | null>("session-1");
const chatStatusRef = ref<"ready" | "submitted" | "streaming" | "error">("error");
const streamErrorRef = ref<{ code: string; message: string } | null>({
  code: "stream_failed",
  message: "bad network",
});
const iconsRef = ref<Record<string, string>>({});

const selectSession = vi.fn(async (sessionId: string) => {
  activeSessionIdRef.value = sessionId;
});
const renameSession = vi.fn(async () => undefined);
const deleteSession = vi.fn(async () => undefined);
const resetChatState = vi.fn(() => {
  chatStatusRef.value = "ready";
  streamErrorRef.value = null;
});

vi.stubGlobal(
  "prompt",
  vi.fn(() => null)
);
vi.stubGlobal(
  "confirm",
  vi.fn(() => true)
);

vi.mock("@renderer/stores/session", () => ({
  useSessionStore: () => ({
    activeSessionId: computed(() => activeSessionIdRef.value),
    selectSession,
    renameSession,
    deleteSession,
  }),
}));

vi.mock("@renderer/stores", () => ({
  useChatStore: () => ({
    chatStatus: computed(() => chatStatusRef.value),
    streamError: computed(() => streamErrorRef.value),
    resetChatState,
  }),
}));

vi.mock("@renderer/stores/acp-agents", () => ({
  useAcpAgentsStore: () => ({
    get icons() {
      return iconsRef.value;
    },
  }),
}));

function makeSession(id: string): Session {
  return {
    id,
    projectId: "project-1",
    agentId: "claude-code",
    title: `Session ${id}`,
    status: "ended",
    turnCount: 1,
    tokenUsage: { used: 10, size: 100 },
    createdAt: new Date("2026-05-12T00:00:00.000Z"),
    updatedAt: new Date("2026-05-12T00:00:00.000Z"),
    messages: [],
  };
}

describe("SessionItem", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    activeSessionIdRef.value = "session-1";
    chatStatusRef.value = "error";
    streamErrorRef.value = { code: "stream_failed", message: "bad network" };
    iconsRef.value = {};
    selectSession.mockClear();
    renameSession.mockClear();
    deleteSession.mockClear();
    resetChatState.mockClear();
  });

  it("resets transient chat state after switching sessions", async () => {
    const wrapper = mount(SessionItem, {
      props: {
        session: makeSession("session-2"),
      },
      global: {
        plugins: [createPinia()],
        stubs: {
          UDropdownMenu: {
            template: "<div><slot /></div>",
            props: ["items"],
          },
          UButton: {
            template: '<button type="button"><slot /></button>',
          },
          UIcon: true,
        },
      },
    });

    await wrapper.get(".group").trigger("click");

    expect(selectSession).toHaveBeenCalledWith("session-2");
    expect(resetChatState).toHaveBeenCalledTimes(1);
    expect(chatStatusRef.value).toBe("ready");
    expect(streamErrorRef.value).toBeNull();
    expect(activeSessionIdRef.value).toBe("session-2");
  });

  it("renders agent icon when the session agent has a matching icon", () => {
    iconsRef.value = {
      "claude-code": "data:image/png;base64,agent-icon",
    };

    const wrapper = mount(SessionItem, {
      props: {
        session: makeSession("session-2"),
      },
      global: {
        plugins: [createPinia()],
      },
    });

    const icon = wrapper.get('[data-test="session-agent-icon"]');
    expect(wrapper.find('[data-test="session-media"]').exists()).toBe(true);
    expect(icon.attributes("src")).toBe("data:image/png;base64,agent-icon");
    expect(icon.attributes("alt")).toBe("claude-code icon");
  });

  it("keeps a stable leading slot when the session agent icon is missing", () => {
    const session = {
      ...makeSession("session-3"),
      agentId: "unknown-agent",
      title: "Long session title",
      turnCount: 4,
    };

    const wrapper = mount(SessionItem, {
      props: {
        session,
      },
      global: {
        plugins: [createPinia()],
      },
    });

    expect(wrapper.find('[data-test="session-media"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="session-agent-icon"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="session-agent-icon-fallback"]').exists()).toBe(true);
    expect(wrapper.get('[data-test="session-title"]').text()).toBe("Long session title");
    expect(wrapper.get('[data-test="session-meta"]').text()).toContain("4 turns");
    expect(wrapper.text()).toContain("Long session title");
    expect(wrapper.text()).toContain("4 turns");
  });

  it("keeps the running indicator inside the leading media area", () => {
    const wrapper = mount(SessionItem, {
      props: {
        session: {
          ...makeSession("session-4"),
          status: "running",
        },
      },
      global: {
        plugins: [createPinia()],
      },
    });

    const media = wrapper.get('[data-test="session-media"]');
    const indicator = media.get('[data-test="session-running-indicator"]');

    expect(media.classes().some((className) => className.includes("ring-success"))).toBe(false);
    expect(indicator.classes()).toContain("animate-pulse");
    expect(wrapper.find('[data-test="session-status"]').exists()).toBe(false);
  });
});
