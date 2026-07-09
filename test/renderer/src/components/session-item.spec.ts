import { computed, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
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
const taskInfoBySessionIdRef = ref(
  new Map<string, { source: "local" | "yunxiao" | "github"; title: string; ref: string }>()
);

const selectSession = vi.fn(async (sessionId: string) => {
  activeSessionIdRef.value = sessionId;
});
const renameSession = vi.fn(async () => undefined);
const deleteSession = vi.fn(async () => undefined);
const resetChatState = vi.fn(() => {
  chatStatusRef.value = "ready";
  streamErrorRef.value = null;
});
const cancelStream = vi.fn();
const ensureSessionOriginTaskInfo = vi.fn(async () => undefined);
const confirmDialogMock = vi.fn<(options: Record<string, unknown>) => Promise<boolean>>();
const { openChatSessionMock } = vi.hoisted(() => ({
  openChatSessionMock: vi.fn<(sessionId: string) => Promise<void>>(),
}));

vi.mock("@renderer/composables/useConfirmDialog", () => ({
  useConfirmDialog: () => confirmDialogMock,
}));

vi.mock("@renderer/stores", () => ({
  useSessionStore: () => ({
    get activeSessionId() {
      return activeSessionIdRef.value;
    },
    get taskInfoBySessionId() {
      return taskInfoBySessionIdRef.value;
    },
    selectSession,
    renameSession,
    deleteSession,
    ensureSessionOriginTaskInfo,
  }),
  useChatStore: () => ({
    chatStatus: computed(() => chatStatusRef.value),
    streamError: computed(() => streamErrorRef.value),
    resetChatState,
    cancelStream,
  }),
  useAcpAgentsStore: () => ({
    get icons() {
      return iconsRef.value;
    },
  }),
}));

vi.mock("@renderer/composables/useOpenChatSession", () => ({
  useOpenChatSession: () => ({
    openChatSession: openChatSessionMock,
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

function mountSessionItem(session: Session) {
  return mount(SessionItem, {
    props: {
      session,
    },
    global: {
      plugins: [createPinia()],
    },
  });
}

describe("SessionItem", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    activeSessionIdRef.value = "session-1";
    chatStatusRef.value = "error";
    streamErrorRef.value = { code: "stream_failed", message: "bad network" };
    iconsRef.value = {};
    taskInfoBySessionIdRef.value = new Map();
    selectSession.mockClear();
    renameSession.mockClear();
    deleteSession.mockClear();
    resetChatState.mockClear();
    cancelStream.mockClear();
    ensureSessionOriginTaskInfo.mockClear();
    confirmDialogMock.mockReset();
    openChatSessionMock.mockReset();
    openChatSessionMock.mockImplementation(async (sessionId: string) => {
      resetChatState();
      await selectSession(sessionId);
    });
  });

  it("clears transient view state without stopping streams after switching sessions", async () => {
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
    expect(cancelStream).not.toHaveBeenCalled();
    expect(chatStatusRef.value).toBe("ready");
    expect(streamErrorRef.value).toBeNull();
    expect(activeSessionIdRef.value).toBe("session-2");
    expect(openChatSessionMock).toHaveBeenCalledWith("session-2");
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

  it("renders an origin task indicator when the session has an origin task ref", () => {
    const wrapper = mountSessionItem({
      ...makeSession("session-origin"),
      originTaskRef: "yunxiao:STORY-42",
    });

    const indicator = wrapper.get('[data-test="session-origin-task-indicator"]');

    expect(indicator.attributes("aria-label")).toBe("查看关联任务");
    expect(indicator.get("i").attributes("data-icon-name")).toBe("i-lucide-clipboard-check");
  });

  it("does not render an origin task indicator when the session has no origin task ref", () => {
    const wrapper = mountSessionItem(makeSession("session-no-origin"));

    expect(wrapper.find('[data-test="session-origin-task-indicator"]').exists()).toBe(false);
    expect(wrapper.get('[data-test="session-meta"]').text()).toContain("1 turns");
  });

  it("loads origin task info when hovering the indicator", async () => {
    const session = {
      ...makeSession("session-origin"),
      originTaskRef: "yunxiao:STORY-42" as const,
    };
    const wrapper = mountSessionItem(session);

    await wrapper.get('[data-test="session-origin-task-indicator"]').trigger("mouseenter");

    expect(ensureSessionOriginTaskInfo).toHaveBeenCalledWith(session);
  });

  it.each([
    ["local:task-1", "本地", "本地任务标题"],
    ["yunxiao:STORY-42", "云效", "云效任务标题"],
    ["github:repo-1:42", "GitHub", "GitHub task title"],
  ] as const)(
    "renders the origin task source and title for %s",
    async (originTaskRef, expectedSourceLabel, title) => {
      taskInfoBySessionIdRef.value = new Map([
        [
          `session-${expectedSourceLabel}`,
          {
            source: originTaskRef.split(":")[0] as "local" | "yunxiao" | "github",
            title,
            ref: originTaskRef,
          },
        ],
      ]);
      const wrapper = mountSessionItem({
        ...makeSession(`session-${expectedSourceLabel}`),
        originTaskRef,
      });

      await wrapper.get('[data-test="session-origin-task-indicator"]').trigger("mouseenter");

      expect(wrapper.get('[data-test="session-origin-task-source"]').text()).toContain(
        expectedSourceLabel
      );
      expect(wrapper.get('[data-test="session-origin-task-title"]').text()).toBe(title);
      expect(wrapper.text()).not.toContain("已关联任务");
    }
  );

  it("renders the loading text before origin task info is available", async () => {
    ensureSessionOriginTaskInfo.mockReturnValueOnce(new Promise<undefined>(() => undefined));
    const wrapper = mountSessionItem({
      ...makeSession("session-origin"),
      originTaskRef: "local:task-1",
    });

    await wrapper.get('[data-test="session-origin-task-indicator"]').trigger("mouseenter");

    expect(wrapper.get('[data-test="session-origin-task-title"]').text()).toBe("正在加载任务…");
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

  it("starts title editing from the dropdown and commits a changed trimmed title", async () => {
    const session = makeSession("session-rename");
    const wrapper = mountSessionItem(session);

    await wrapper.get('[data-test="dropdown-item-修改标题"]').trigger("click");

    const input = wrapper.get<HTMLInputElement>('[data-test="session-title-input"]');
    expect(input.element.value).toBe("Session session-rename");

    await input.setValue("  Updated session title  ");
    await input.trigger("keydown.enter");
    await flushPromises();

    expect(renameSession).toHaveBeenCalledWith("session-rename", "Updated session title");
    expect(wrapper.find('[data-test="session-title-input"]').exists()).toBe(false);
  });

  it("does not rename when the submitted title is blank", async () => {
    const wrapper = mountSessionItem(makeSession("session-blank"));

    await wrapper.get('[data-test="dropdown-item-修改标题"]').trigger("click");
    const input = wrapper.get('[data-test="session-title-input"]');
    await input.setValue("   ");
    await input.trigger("keydown.enter");
    await flushPromises();

    expect(renameSession).not.toHaveBeenCalled();
    expect(wrapper.find('[data-test="session-title-input"]').exists()).toBe(false);
  });

  it("does not rename when the trimmed title is unchanged", async () => {
    const wrapper = mountSessionItem(makeSession("session-unchanged"));

    await wrapper.get('[data-test="dropdown-item-修改标题"]').trigger("click");
    const input = wrapper.get('[data-test="session-title-input"]');
    await input.setValue("  Session session-unchanged  ");
    await input.trigger("blur");
    await flushPromises();

    expect(renameSession).not.toHaveBeenCalled();
    expect(wrapper.find('[data-test="session-title-input"]').exists()).toBe(false);
  });

  it("cancels title editing with Escape without renaming", async () => {
    const wrapper = mountSessionItem(makeSession("session-cancel"));

    await wrapper.get('[data-test="dropdown-item-修改标题"]').trigger("click");
    const input = wrapper.get('[data-test="session-title-input"]');
    await input.setValue("Updated title");
    await input.trigger("keydown.escape");
    await flushPromises();

    expect(renameSession).not.toHaveBeenCalled();
    expect(wrapper.find('[data-test="session-title-input"]').exists()).toBe(false);
    expect(wrapper.get('[data-test="session-title"]').text()).toBe("Session session-cancel");
  });

  it("deletes the session when the confirm dialog resolves true", async () => {
    confirmDialogMock.mockResolvedValue(true);
    const wrapper = mountSessionItem(makeSession("session-delete"));

    await wrapper.get('[data-test="dropdown-item-删除"]').trigger("click");
    await flushPromises();

    expect(confirmDialogMock).toHaveBeenCalledWith({
      title: "删除会话？",
      description: "会话“Session session-delete”将从历史记录中永久删除，且不可撤销。",
      confirmLabel: "删除会话",
      confirmColor: "error",
    });
    expect(deleteSession).toHaveBeenCalledWith("session-delete");
  });

  it("does not delete the session when the confirm dialog resolves false", async () => {
    confirmDialogMock.mockResolvedValue(false);
    const wrapper = mountSessionItem(makeSession("session-keep"));

    await wrapper.get('[data-test="dropdown-item-删除"]').trigger("click");
    await flushPromises();

    expect(confirmDialogMock).toHaveBeenCalledTimes(1);
    expect(deleteSession).not.toHaveBeenCalled();
  });

  it("does not reserve permanent title padding and keeps the action trigger accessible", () => {
    const wrapper = mountSessionItem(makeSession("session-layout"));

    const titleContainer = wrapper.get('[data-test="session-title"]').element.parentElement;
    const actionButton = wrapper.get('button[aria-label="会话操作"]');
    const actionContainer = actionButton.element.closest(".absolute");

    expect(titleContainer?.className).not.toContain("pr-8");
    expect(actionButton.classes()).toEqual(expect.arrayContaining(["h-7", "w-7"]));
    expect(actionContainer?.className).toContain("group-hover:opacity-100");
    expect(actionContainer?.className).toContain("group-focus-within:opacity-100");
  });

  it("keeps the action trigger visible while the dropdown is open", async () => {
    const dropdownMenuOpenStub = {
      template:
        '<div><slot /><button type="button" data-test="open-dropdown" @click="$emit(\'update:open\', true)">Open</button></div>',
      props: ["items", "open"],
      emits: ["update:open"],
    };
    const wrapper = mount(SessionItem, {
      props: {
        session: makeSession("session-menu-open"),
      },
      global: {
        plugins: [createPinia()],
        stubs: {
          UDropdownMenu: dropdownMenuOpenStub,
          DropdownMenu: dropdownMenuOpenStub,
        },
      },
    });

    await wrapper.get('[data-test="open-dropdown"]').trigger("click");
    await flushPromises();

    const actionContainer = wrapper
      .get('button[aria-label="会话操作"]')
      .element.closest(".absolute");
    expect(actionContainer?.className).toContain("opacity-100");
  });
});
