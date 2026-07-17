import { computed, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import ChatContainer from "@renderer/components/chat/ChatContainer.vue";
import type { AcpAvailableCommand, Session } from "@shared/types/chat";

const activeSessionRef = ref<Session | null>(null);
const activeSessionIdRef = ref<string | null>(null);
const isLoadingMessagesRef = ref(false);
const chatStatusRef = ref<"ready" | "submitted" | "streaming" | "error">("ready");
const streamErrorRef = ref<{ code: string; message: string } | null>(null);
const activeStreamIndicatorRef = ref<{ messageId: string; startedAt: number } | null>(null);
const persistSessionActionStateMock = vi.hoisted(() => vi.fn());
const scrollIntoViewMock = vi.fn();

vi.mock("@renderer/stores", () => ({
  useChatStore: () => ({
    sendMessage: vi.fn(),
    cancelStream: vi.fn(),
    resetChatState: vi.fn(),
  }),
  useSessionStore: () => ({
    activeSession: computed(() => activeSessionRef.value),
    activeSessionId: computed(() => activeSessionIdRef.value),
    isLoadingMessages: computed(() => isLoadingMessagesRef.value),
    getSessionProposals: () => [],
    persistSessionActionState: persistSessionActionStateMock,
    beginDraftSession: vi.fn(),
  }),
}));

vi.mock("pinia", async (importOriginal) => {
  const actual = await importOriginal<typeof import("pinia")>();
  return {
    ...actual,
    storeToRefs: (store: Record<string, unknown>) => {
      void store;
      return {
        chatStatus: computed(() => chatStatusRef.value),
        streamError: computed(() => streamErrorRef.value),
        activeStreamIndicator: computed(() => activeStreamIndicatorRef.value),
        activeSession: computed(() => activeSessionRef.value),
        activeSessionId: computed(() => activeSessionIdRef.value),
        isLoadingMessages: computed(() => isLoadingMessagesRef.value),
      };
    },
  };
});

function mountContainer(props: { sidebarCollapsed?: boolean } = {}): VueWrapper {
  return mount(ChatContainer, {
    props: {
      sidebarCollapsed: props.sidebarCollapsed ?? false,
    },
    global: {
      plugins: [createPinia()],
      stubs: {
        ChatMessageList: {
          props: ["messages", "status", "type", "streamIndicator"],
          template: `
            <div data-test="message-list">
              {{ messages.length }}|{{ status }}|{{ type }}
              <div v-if="streamIndicator" data-test="stream-indicator-projection">{{ streamIndicator.messageId }}</div>
              <div
                v-for="message in messages"
                :key="message.id"
                :data-chat-user-message-id="message.role === 'user' ? message.id : undefined"
              ></div>
              <div
                v-if="messages.length"
                data-test="action-anchor"
                data-fyllo-action-id="chat:session-1:0:0:0"
              ></div>
            </div>
          `,
        },
        ChatStreamError: {
          template: '<div data-test="stream-error">{{ errorMessage }}</div>',
          computed: {
            errorMessage(): string {
              return streamErrorRef.value?.message ?? "";
            },
          },
        },
        ChatEmptyAgentPicker: { template: '<div data-test="empty-agent-picker"></div>' },
        ChatPromptPanel: { template: '<div data-test="prompt-panel"></div>' },
        ChatAgentAgendaPanel: {
          props: ["entries"],
          template: '<div data-test="chat-agent-agenda-panel">{{ entries.length }}</div>',
        },
      },
    },
  });
}

function makeSession(commands: AcpAvailableCommand[] = []): Session {
  return {
    id: "session-1",
    projectId: "project-1",
    agentId: "claude-code",
    title: "Session",
    isPinned: false,
    status: "ended",
    turnCount: 0,
    tokenUsage: { used: 128, size: 1024 },
    createdAt: new Date("2026-05-12T00:00:00.000Z"),
    updatedAt: new Date("2026-05-12T00:00:00.000Z"),
    messages: [],
    availableCommands: commands,
  };
}

function makeSessionWithPendingAction(): Session {
  const session = makeSession();
  session.messages = [
    {
      id: "message-1",
      role: "assistant",
      metadata: { sessionId: session.id, createdAt: new Date("2026-05-12T00:00:00.000Z") },
      parts: [
        {
          type: "text",
          text: '<fyllo-action type="task.create">{"title":"补齐错误处理"}</fyllo-action>',
        },
      ],
    } as Session["messages"][number],
  ];
  return session;
}

function makeSessionWithUserPrompt(): Session {
  const session = makeSession();
  session.messages = [
    {
      id: "user-message-1",
      role: "user",
      metadata: { sessionId: session.id, createdAt: new Date("2026-05-12T00:00:00.000Z") },
      parts: [{ type: "text", text: "定位这条 prompt" }],
    } as Session["messages"][number],
    {
      id: "user-message-2",
      role: "user",
      metadata: { sessionId: session.id, createdAt: new Date("2026-05-12T00:01:00.000Z") },
      parts: [{ type: "text", text: "第二条 prompt" }],
    } as Session["messages"][number],
  ];
  return session;
}

describe("ChatContainer", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    activeSessionRef.value = null;
    activeSessionIdRef.value = null;
    isLoadingMessagesRef.value = false;
    chatStatusRef.value = "ready";
    streamErrorRef.value = null;
    activeStreamIndicatorRef.value = null;
    persistSessionActionStateMock.mockReset();
    scrollIntoViewMock.mockReset();
    vi.stubGlobal("CSS", {
      escape: (value: string) => value,
    });
    window.HTMLElement.prototype.scrollIntoView = scrollIntoViewMock;
  });

  it("renders the empty agent picker until the active session has messages", async () => {
    const wrapper = mountContainer();

    expect(wrapper.find('[data-test="empty-agent-picker"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="message-list"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="prompt-panel"]').exists()).toBe(true);

    const session = makeSession([{ name: "review", description: "Review code" }]);
    session.messages = [{} as Session["messages"][number]];
    activeSessionRef.value = session;
    activeSessionIdRef.value = session.id;
    await wrapper.vm.$nextTick();

    expect(wrapper.find('[data-test="empty-agent-picker"]').exists()).toBe(false);
    expect(wrapper.get('[data-test="message-list"]').text()).toBe("1|ready|chat");
    expect(wrapper.find('[data-test="prompt-panel"]').exists()).toBe(true);
  });

  it("forwards the active session stream indicator projection to the message list", async () => {
    const session = makeSession();
    session.messages = [{} as Session["messages"][number]];
    activeSessionRef.value = session;
    activeSessionIdRef.value = session.id;
    activeStreamIndicatorRef.value = { messageId: "renderer-message-1", startedAt: 1234 };

    const wrapper = mountContainer();

    expect(wrapper.get('[data-test="stream-indicator-projection"]').text()).toBe(
      "renderer-message-1"
    );
  });

  it("emits toggle-sidebar from the sidebar toggle button", async () => {
    const wrapper = mountContainer();

    await wrapper.get('[aria-label="折叠聊天列表"]').trigger("click");

    expect(wrapper.emitted("toggle-sidebar")).toHaveLength(1);
  });

  it("renders expanded sidebar toggle semantics", () => {
    const wrapper = mountContainer({ sidebarCollapsed: false });
    const button = wrapper.get('[aria-label="折叠聊天列表"]');

    expect(button.attributes("data-icon")).toBe("i-lucide-panel-left-close");
    expect(button.attributes("title")).toBe("折叠聊天列表");
    expect(button.attributes("aria-expanded")).toBe("true");
  });

  it("renders collapsed sidebar toggle semantics", () => {
    const wrapper = mountContainer({ sidebarCollapsed: true });
    const button = wrapper.get('[aria-label="展开聊天列表"]');

    expect(button.attributes("data-icon")).toBe("i-lucide-panel-left-open");
    expect(button.attributes("title")).toBe("展开聊天列表");
    expect(button.attributes("aria-expanded")).toBe("false");
  });

  it("renders an inline stream error after the message list", async () => {
    const session = makeSession();
    session.messages = [{} as Session["messages"][number], {} as Session["messages"][number]];
    activeSessionRef.value = session;
    activeSessionIdRef.value = session.id;
    streamErrorRef.value = {
      code: "stream_failed",
      message: "The stream disconnected unexpectedly",
    };

    const wrapper = mountContainer();

    expect(wrapper.get('[data-test="message-list"]').text()).toBe("2|ready|chat");
    expect(wrapper.get('[data-test="stream-error"]').text()).toBe(
      "The stream disconnected unexpectedly"
    );

    const children = wrapper.get(".max-w-3xl").element.children;
    expect(children?.[0]?.getAttribute("data-test")).toBe("message-list");
    expect(children?.[1]?.querySelector('[data-test="stream-error"]')).not.toBeNull();
  });

  it("hides the previous inline error when a new stream starts or completes", async () => {
    const session = makeSession();
    activeSessionRef.value = session;
    activeSessionIdRef.value = session.id;
    streamErrorRef.value = { code: "stream_failed", message: "old error" };

    const wrapper = mountContainer();
    expect(wrapper.find('[data-test="stream-error"]').exists()).toBe(true);

    chatStatusRef.value = "submitted";
    streamErrorRef.value = null;
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-test="stream-error"]').exists()).toBe(false);

    streamErrorRef.value = { code: "stream_failed", message: "temporary error" };
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-test="stream-error"]').exists()).toBe(true);

    chatStatusRef.value = "ready";
    streamErrorRef.value = null;
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-test="stream-error"]').exists()).toBe(false);
  });

  it("does not render the event rail in draft mode", () => {
    const wrapper = mountContainer();

    expect(wrapper.find('[data-test="empty-agent-picker"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="event-rail"]').exists()).toBe(false);
    expect(wrapper.element.children).toHaveLength(1);
  });

  it("renders the event rail for non-draft sessions with agent agenda entries", async () => {
    const session = makeSession();
    session.agentAgenda = [
      { content: "Step 1", priority: "high", status: "completed" },
      { content: "Step 2", priority: "medium", status: "in_progress" },
    ];
    activeSessionRef.value = session;
    activeSessionIdRef.value = session.id;

    const wrapper = mountContainer();

    expect(wrapper.find('[data-test="event-rail"]').exists()).toBe(true);
    expect(wrapper.element.children).toHaveLength(2);
  });

  it("renders the event rail for non-draft sessions with only pending Fyllo actions", async () => {
    const session = makeSessionWithPendingAction();
    activeSessionRef.value = session;
    activeSessionIdRef.value = session.id;

    const wrapper = mountContainer();

    expect(wrapper.find('[data-test="event-rail"]').exists()).toBe(true);
  });

  it("passes the message scroll container to the event rail host", async () => {
    const session = makeSessionWithPendingAction();
    activeSessionRef.value = session;
    activeSessionIdRef.value = session.id;

    const wrapper = mountContainer();
    await wrapper.get('[data-test="fyllo-action-rail-item"]').trigger("click");
    await flushPromises();

    expect(scrollIntoViewMock).toHaveBeenCalledWith({
      block: "center",
      behavior: "smooth",
    });
  });

  it("renders the prompt timeline and scrolls to a user prompt anchor", async () => {
    const session = makeSessionWithUserPrompt();
    activeSessionRef.value = session;
    activeSessionIdRef.value = session.id;

    const wrapper = mountContainer();
    await wrapper.vm.$nextTick();

    expect(wrapper.find('[data-test="chat-prompt-timeline"]').exists()).toBe(true);

    await wrapper.get('[data-test="chat-prompt-timeline-item"]').trigger("click");
    await flushPromises();

    expect(scrollIntoViewMock).toHaveBeenCalledWith({
      block: "center",
      behavior: "smooth",
    });
  });

  it("does not render the event rail when the active session has no agent agenda entries", async () => {
    const session = makeSession();
    session.agentAgenda = [];
    activeSessionRef.value = session;
    activeSessionIdRef.value = session.id;

    const wrapper = mountContainer();

    expect(wrapper.find('[data-test="event-rail"]').exists()).toBe(false);
    expect(wrapper.element.children).toHaveLength(1);
  });

  it("keeps the prompt panel inside the conversation column", async () => {
    const session = makeSession();
    session.agentAgenda = [{ content: "Step 1", priority: "high", status: "completed" }];
    activeSessionRef.value = session;
    activeSessionIdRef.value = session.id;

    const wrapper = mountContainer();

    const promptPanel = wrapper.get('[data-test="prompt-panel"]').element;
    expect(promptPanel.closest(".flex-col")).not.toBeNull();
    expect(promptPanel.closest('[data-test="event-rail"]')).toBeNull();
  });

  it("does not render the agent agenda panel at the old bottom position", async () => {
    const session = makeSession();
    session.agentAgenda = [{ content: "Step 1", priority: "high", status: "completed" }];
    activeSessionRef.value = session;
    activeSessionIdRef.value = session.id;

    const wrapper = mountContainer();
    const bottomContainers = wrapper.findAll(".max-w-3xl");
    const bottomContainer = bottomContainers[bottomContainers.length - 1];

    expect(bottomContainer.find('[data-test="prompt-panel"]').exists()).toBe(true);
    expect(bottomContainer.find('[data-test="chat-agent-agenda-panel"]').exists()).toBe(false);
  });
});
