import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { computed, ref, type PropType } from "vue";
import { createPinia, setActivePinia } from "pinia";
import ChatMessageList from "@renderer/components/chat/message/ChatMessageList.vue";
import { chatApi } from "@renderer/api/session/chat";
import { useSessionStore } from "@renderer/stores";
import type { ChatStatus, MessageMeta } from "@shared/types/chat";
import type { DynamicToolUIPart, UIMessage } from "ai";

vi.mock("@renderer/api/session/chat", () => ({
  chatApi: {
    readAttachmentDataUrl: vi.fn(),
  },
}));

const writeTextMock = vi.fn();
const originalClipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");

function formatMessageTime(date: Date): string {
  return date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatFullMessageTime(date: Date): string {
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function textMessage(): UIMessage<MessageMeta> {
  return assistantMessage([{ type: "text", text: "hello" }]);
}

function assistantMessage(parts: UIMessage<MessageMeta>["parts"]): UIMessage<MessageMeta> {
  return {
    id: "message-1",
    role: "assistant",
    parts,
    metadata: { sessionId: "session-1", createdAt: new Date("2026-05-08T00:00:00.000Z") },
  };
}

function userMessage(parts: UIMessage<MessageMeta>["parts"]): UIMessage<MessageMeta> {
  return {
    id: "user-message-1",
    role: "user",
    parts,
    metadata: { sessionId: "session-1", createdAt: new Date("2026-05-08T00:00:00.000Z") },
  };
}

function dynamicTool(
  toolCallId: string,
  toolName: string,
  output: string,
  toolKind?: string,
  input: unknown = {}
): DynamicToolUIPart {
  return {
    type: "dynamic-tool",
    toolCallId,
    toolName,
    state: "output-available",
    input,
    output,
    ...(toolKind === undefined ? {} : { toolMetadata: { toolKind } }),
  };
}

function streamingTool(toolCallId: string, toolName: string, toolKind?: string): DynamicToolUIPart {
  return {
    type: "dynamic-tool",
    toolCallId,
    toolName,
    state: "input-available",
    input: {},
    ...(toolKind === undefined ? {} : { toolMetadata: { toolKind } }),
  };
}

function reasoning(
  text: string,
  state: "streaming" | "done" = "done"
): Extract<UIMessage["parts"][number], { type: "reasoning" }> {
  return { type: "reasoning", text, state };
}

function subagentTool(
  toolCallId: string,
  options: {
    description?: string;
    prompt?: string;
    output?: string;
    parentToolCallId?: string;
    status?: "in_progress" | "completed" | "failed";
    agentType?: string;
    resolvedModel?: string;
    totalTokens?: number;
    totalDurationMs?: number;
    totalToolUseCount?: number;
    toolStats?: Record<string, number>;
  } = {}
): DynamicToolUIPart {
  const isParent = !options.parentToolCallId;
  const input = {
    ...(options.description ? { description: options.description } : {}),
    ...(options.prompt ? { prompt: options.prompt } : {}),
  };
  const toolMetadata = isParent
    ? {
        toolKind: "think",
        subagent: {
          ...(options.status ? { status: options.status } : {}),
          ...(options.agentType ? { agentType: options.agentType } : {}),
          ...(options.resolvedModel ? { resolvedModel: options.resolvedModel } : {}),
          ...(options.totalTokens === undefined ? {} : { totalTokens: options.totalTokens }),
          ...(options.totalDurationMs === undefined
            ? {}
            : { totalDurationMs: options.totalDurationMs }),
          ...(options.totalToolUseCount === undefined
            ? {}
            : { totalToolUseCount: options.totalToolUseCount }),
          ...(options.toolStats ? { toolStats: options.toolStats } : {}),
        },
      }
    : { toolKind: "read", parentToolCallId: options.parentToolCallId };

  return {
    type: "dynamic-tool",
    toolCallId,
    toolName: isParent ? "Task" : "Read",
    title: options.description ?? (isParent ? "Task" : `Read ${toolCallId}`),
    state: options.output === undefined ? "input-available" : "output-available",
    input,
    ...(options.output === undefined ? {} : { output: options.output }),
    toolMetadata,
  } as DynamicToolUIPart;
}

type TextPartMetrics = {
  scrollHeight: number;
  clientHeight: number;
};

let restoreTextHeightMock: (() => void) | null = null;

function mockUserTextPartHeights(getMetrics: (element: HTMLElement) => TextPartMetrics): void {
  const prototype = HTMLElement.prototype;
  const scrollHeightDescriptor = Object.getOwnPropertyDescriptor(prototype, "scrollHeight");
  const clientHeightDescriptor = Object.getOwnPropertyDescriptor(prototype, "clientHeight");

  restoreTextHeightMock?.();

  Object.defineProperty(prototype, "scrollHeight", {
    configurable: true,
    get(this: HTMLElement) {
      return getMetrics(this).scrollHeight;
    },
  });

  Object.defineProperty(prototype, "clientHeight", {
    configurable: true,
    get(this: HTMLElement) {
      return getMetrics(this).clientHeight;
    },
  });

  restoreTextHeightMock = () => {
    if (scrollHeightDescriptor) {
      Object.defineProperty(prototype, "scrollHeight", scrollHeightDescriptor);
    } else {
      Reflect.deleteProperty(prototype, "scrollHeight");
    }

    if (clientHeightDescriptor) {
      Object.defineProperty(prototype, "clientHeight", clientHeightDescriptor);
    } else {
      Reflect.deleteProperty(prototype, "clientHeight");
    }
  };
}

function mockUserTextOverflow(isOverflowing: (text: string) => boolean): void {
  mockUserTextPartHeights((element) => {
    if (element.getAttribute("data-test") !== "user-message-text") {
      return { scrollHeight: 0, clientHeight: 0 };
    }

    return isOverflowing(element.textContent ?? "")
      ? { scrollHeight: 240, clientHeight: 160 }
      : { scrollHeight: 120, clientHeight: 160 };
  });
}

function createSession() {
  return {
    id: "session-1",
    projectId: "project-1",
    agentId: "claude-code",
    title: "Session",
    isPinned: false,
    status: "ended" as const,
    turnCount: 0,
    tokenUsage: { used: 0, size: 0 },
    createdAt: new Date("2026-05-08T00:00:00.000Z"),
    updatedAt: new Date("2026-05-08T00:00:00.000Z"),
    messages: [],
  };
}

function mountList(
  messages: UIMessage<MessageMeta>[],
  status: ChatStatus = "ready",
  agentId?: string,
  type: "chat" | "side" = "chat",
  streamIndicator?: { messageId: string; startedAt: number } | null
): VueWrapper {
  const pinia = createPinia();
  setActivePinia(pinia);
  useSessionStore().sessions = [createSession()];

  const chatMessagesStub = {
    props: ["messages", "status", "user", "assistant"],
    template:
      '<div data-test="chat-messages" :data-status="status"><div v-for="message in messages" :key="message.id"><slot name="content" :message="message" /><slot name="actions" :message="message" /></div></div>',
  };
  const chatToolStub = {
    props: {
      text: String,
      suffix: String,
      streaming: Boolean,
      icon: String,
      open: { type: Boolean, default: undefined },
      variant: String,
      ui: Object as PropType<{ content?: string }>,
    },
    emits: ["update:open"],
    setup(
      props: { open?: boolean },
      { emit }: { emit: (event: "update:open", value: boolean) => void }
    ) {
      const internalOpen = ref(false);
      const isOpen = computed(() => (props.open === undefined ? internalOpen.value : props.open));
      function toggle(): void {
        if (props.open === undefined) internalOpen.value = !internalOpen.value;
        else emit("update:open", !props.open);
      }
      return { isOpen, toggle };
    },
    template:
      '<div data-test="tool" :data-streaming="String(streaming)" :data-icon="icon" :data-variant="variant" :data-ui-content="ui?.content ?? \'\'" :data-has-suffix="String(suffix !== undefined)" :aria-expanded="String(isOpen)" @click.stop="toggle"><span data-test="tool-text">{{ text }}</span><span v-if="suffix !== undefined" data-test="tool-suffix">{{ suffix }}</span><slot v-if="isOpen" /></div>',
  };
  const chatReasoningStub = {
    props: {
      text: String,
      streaming: Boolean,
      open: { type: Boolean, default: undefined },
      duration: Number,
      icon: String,
    },
    emits: ["update:open"],
    setup(
      props: { open?: boolean; streaming?: boolean },
      { emit }: { emit: (event: "update:open", value: boolean) => void }
    ) {
      const internalOpen = ref(Boolean(props.streaming));
      const isOpen = computed(() => (props.open === undefined ? internalOpen.value : props.open));
      function toggle(): void {
        if (props.open === undefined) internalOpen.value = !internalOpen.value;
        else emit("update:open", !props.open);
      }
      return { isOpen, toggle };
    },
    template:
      '<div data-test="reasoning" :data-streaming="String(streaming)" :data-icon="icon" :data-duration="duration" :aria-expanded="String(isOpen)" @click.stop="toggle"><span data-test="reasoning-label">Thinking</span><span v-if="isOpen" data-test="reasoning-text">{{ text }}</span></div>',
  };
  const tooltipStub = {
    props: ["text"],
    template: '<span :data-tooltip="text"><slot /></span>',
  };

  return mount(ChatMessageList, {
    props: {
      messages,
      status,
      type,
      agentId,
      streamIndicator,
    },
    global: {
      plugins: [pinia],
      stubs: {
        MarkStream: {
          props: ["content", "isStreaming", "isDark", "enableActions", "actionContext"],
          template:
            '<div data-test="markdown" :data-enable-actions="String(enableActions)" :data-action-part-index="actionContext?.partIndex">{{ content }}</div>',
        },
        UChatMessages: chatMessagesStub,
        ChatMessages: chatMessagesStub,
        UChatTool: chatToolStub,
        ChatTool: chatToolStub,
        UChatReasoning: chatReasoningStub,
        ChatReasoning: chatReasoningStub,
        UTooltip: tooltipStub,
        Tooltip: tooltipStub,
        AssistantStreamIndicator: {
          props: ["startedAt"],
          template:
            '<div data-test="assistant-stream-indicator" :data-started-at="String(startedAt)"></div>',
        },
      },
    },
  });
}

describe("UIMessageList", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    writeTextMock.mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: writeTextMock },
    });
    vi.mocked(chatApi.readAttachmentDataUrl).mockResolvedValue({
      ok: true,
      data: { dataUrl: "data:image/png;base64,AAAA" },
    });
  });

  afterEach(() => {
    restoreTextHeightMock?.();
    restoreTextHeightMock = null;
    vi.useRealTimers();
    if (originalClipboardDescriptor) {
      Object.defineProperty(navigator, "clipboard", originalClipboardDescriptor);
    } else {
      Reflect.deleteProperty(navigator, "clipboard");
    }
  });

  it("renders text parts", () => {
    const wrapper = mountList([textMessage()]);

    expect(wrapper.text()).toContain("hello");
  });

  it("enables Fyllo actions only in chat message lists", () => {
    const chatWrapper = mountList([textMessage()]);
    const sideWrapper = mountList([textMessage()], "ready", undefined, "side");

    expect(chatWrapper.get('[data-test="markdown"]').attributes("data-enable-actions")).toBe(
      "true"
    );
    expect(sideWrapper.get('[data-test="markdown"]').attributes("data-enable-actions")).toBe(
      "false"
    );
  });

  it("renders the stream indicator only below the matching chat assistant message", () => {
    const firstAssistant = assistantMessage([{ type: "text", text: "first" }]);
    const secondAssistant: UIMessage<MessageMeta> = {
      ...assistantMessage([{ type: "text", text: "second" }]),
      id: "message-2",
    };
    const startedAt = new Date("2026-05-08T00:00:12.000Z").getTime();

    const chatWrapper = mountList(
      [firstAssistant, userMessage([{ type: "text", text: "prompt" }]), secondAssistant],
      "streaming",
      undefined,
      "chat",
      { messageId: "message-2", startedAt }
    );
    const sideWrapper = mountList([secondAssistant], "streaming", undefined, "side", {
      messageId: "message-2",
      startedAt,
    });

    expect(chatWrapper.findAll('[data-test="assistant-stream-indicator"]')).toHaveLength(1);
    expect(
      chatWrapper.get('[data-test="assistant-stream-indicator"]').attributes("data-started-at")
    ).toBe(String(startedAt));
    expect(sideWrapper.find('[data-test="assistant-stream-indicator"]').exists()).toBe(false);
  });

  it("copies only text parts and marks copied actions independently", async () => {
    vi.useFakeTimers();
    const wrapper = mountList([
      userMessage([
        { type: "text", text: "first user text" },
        { type: "text", text: "<system-reminder>\nhidden user reminder\n</system-reminder>" },
        { type: "text", text: "second user text" },
      ]),
      assistantMessage([
        { type: "text", text: "assistant text" },
        { type: "text", text: "<system-reminder>\nhidden assistant reminder\n</system-reminder>" },
        dynamicTool("tool-1", "Read", "tool output", "read"),
        { type: "text", text: "assistant follow-up" },
      ]),
    ]);

    const userAction = wrapper.get(
      '[data-test="message-copy-action"][data-message-id="user-message-1"]'
    );
    const assistantAction = wrapper.get(
      '[data-test="message-copy-action"][data-message-id="message-1"]'
    );
    const messageCreatedAt = new Date("2026-05-08T00:00:00.000Z");
    const expectedMessageTime = formatMessageTime(messageCreatedAt);
    const expectedFullMessageTime = formatFullMessageTime(messageCreatedAt);

    expect(userAction.attributes("data-icon")).toBe("i-lucide-copy");
    expect(assistantAction.attributes("data-icon")).toBe("i-lucide-copy");
    const timeNodes = wrapper.findAll('[data-test="message-created-at"]');
    expect(timeNodes.map((node) => node.text())).toEqual([
      expectedMessageTime,
      expectedMessageTime,
    ]);
    expect(timeNodes.map((node) => node.attributes("datetime"))).toEqual([
      messageCreatedAt.toISOString(),
      messageCreatedAt.toISOString(),
    ]);
    expect(
      timeNodes.map((node) => node.element.parentElement?.getAttribute("data-tooltip"))
    ).toEqual([expectedFullMessageTime, expectedFullMessageTime]);

    await userAction.trigger("click");
    await Promise.resolve();
    await wrapper.vm.$nextTick();

    expect(writeTextMock).toHaveBeenLastCalledWith("first user text\n\nsecond user text");
    expect(userAction.attributes("data-icon")).toBe("i-lucide-check");
    expect(userAction.attributes("aria-label")).toBe("已复制");
    expect(assistantAction.attributes("data-icon")).toBe("i-lucide-copy");

    await assistantAction.trigger("click");
    await Promise.resolve();
    await wrapper.vm.$nextTick();

    expect(writeTextMock).toHaveBeenLastCalledWith("assistant text\n\nassistant follow-up");
    expect(userAction.attributes("data-icon")).toBe("i-lucide-check");
    expect(assistantAction.attributes("data-icon")).toBe("i-lucide-check");

    vi.advanceTimersByTime(1600);
    await wrapper.vm.$nextTick();

    expect(userAction.attributes("data-icon")).toBe("i-lucide-copy");
    expect(assistantAction.attributes("data-icon")).toBe("i-lucide-copy");
  });

  it("renders direct tools with independently collapsible Input and Output and no suffix", async () => {
    const wrapper = mountList([
      assistantMessage([
        dynamicTool("tool-1", "Bash", "command output", "execute", { command: "pnpm test" }),
      ]),
    ]);

    const tool = wrapper.get('[data-test="chat-tool-item"]');
    expect(tool.attributes("data-icon")).toBe("i-lucide-square-terminal");
    expect(tool.attributes("data-has-suffix")).toBe("false");
    expect(tool.attributes("aria-expanded")).toBe("false");
    expect(wrapper.find('[data-test="chat-tool-details"]').exists()).toBe(false);

    await tool.trigger("click");

    expect(wrapper.get('[data-test="chat-tool-input"]').text()).toContain("Input");
    expect(wrapper.get('[data-test="chat-tool-input"]').text()).toContain('"command": "pnpm test"');
    expect(wrapper.get('[data-test="chat-tool-output"]').text()).toContain("Output");
    expect(wrapper.get('[data-test="chat-tool-output"]').text()).toContain("command output");
    expect(wrapper.find('[data-test="tool-suffix"]').exists()).toBe(false);
  });

  it("collapses consecutive mixed activities into one activity group summary", () => {
    const wrapper = mountList([
      assistantMessage([
        reasoning("inspect"),
        dynamicTool("tool-1", "Read", "read output", "read"),
        reasoning("compare"),
      ]),
    ]);

    expect(wrapper.findAll('[data-test="chat-activity-group"]')).toHaveLength(1);
    const group = wrapper.get('[data-test="chat-activity-group"]');
    expect(group.get('[data-test="tool-text"]').text()).toBe("Think 2 times, Read 1 file");
    expect(group.attributes("data-icon")).toBe("i-lucide-file-text");
    expect(group.attributes("aria-expanded")).toBe("false");
    expect(wrapper.find('[data-test="chat-activity-group-items"]').exists()).toBe(false);
  });

  it("uses the last streaming tool icon while any activity keeps the group streaming", () => {
    const wrapper = mountList([
      assistantMessage([
        reasoning("inspect", "streaming"),
        streamingTool("tool-1", "Write", "write"),
        dynamicTool("tool-2", "Read", "done", "read"),
      ]),
    ]);

    const group = wrapper.get('[data-test="chat-activity-group"]');
    expect(group.attributes("data-streaming")).toBe("true");
    expect(group.attributes("data-icon")).toBe("i-lucide-file-plus");
    expect(group.attributes("aria-expanded")).toBe("false");
  });

  it("keeps a tool icon when trailing reasoning is streaming", () => {
    const wrapper = mountList([
      assistantMessage([
        dynamicTool("tool-1", "Read", "done", "read"),
        reasoning("compare", "streaming"),
      ]),
    ]);

    const group = wrapper.get('[data-test="chat-activity-group"]');
    expect(group.attributes("data-streaming")).toBe("true");
    expect(group.attributes("data-icon")).toBe("i-lucide-file-text");
  });

  it("uses the brain icon for pure reasoning activity groups", () => {
    const wrapper = mountList([
      assistantMessage([reasoning("inspect"), reasoning("compare", "streaming")]),
    ]);

    const group = wrapper.get('[data-test="chat-activity-group"]');
    expect(group.attributes("data-streaming")).toBe("true");
    expect(group.attributes("data-icon")).toBe("i-lucide-brain");
  });

  it("keeps fallback summaries and icons for historical tools without metadata", () => {
    const wrapper = mountList([
      assistantMessage([
        dynamicTool("tool-1", "Read", "read output"),
        dynamicTool("tool-2", "Write", "write output"),
      ]),
    ]);

    const group = wrapper.get('[data-test="chat-activity-group"]');
    expect(group.get('[data-test="tool-text"]').text()).toBe("Run 2 tools");
    expect(group.attributes("data-icon")).toBe("i-lucide-wrench");
  });

  it("keeps expanded activity children collapsed and in original order", async () => {
    const wrapper = mountList([
      assistantMessage([
        reasoning("first thought", "streaming"),
        dynamicTool("tool-1", "Read", "read output", "read", { path: "README.md" }),
        reasoning("second thought"),
      ]),
    ]);

    await wrapper.get('[data-test="chat-activity-group"]').trigger("click");

    const items = wrapper.get('[data-test="chat-activity-group-items"]');
    expect(items.findAll('[data-test="chat-activity-reasoning"]')).toHaveLength(2);
    expect(items.findAll('[data-test="chat-tool-item"]')).toHaveLength(1);
    expect(
      items
        .findAll('[data-test="chat-activity-reasoning"], [data-test="chat-tool-item"]')
        .map((node) => node.attributes("data-test"))
    ).toEqual(["chat-activity-reasoning", "chat-tool-item", "chat-activity-reasoning"]);
    expect(
      items
        .findAll('[data-test="chat-activity-reasoning"], [data-test="chat-tool-item"]')
        .map((node) => node.attributes("aria-expanded"))
    ).toEqual(["false", "false", "false"]);
    expect(wrapper.text()).not.toContain("first thought");
    expect(wrapper.find('[data-test="chat-tool-details"]').exists()).toBe(false);

    await items.get('[data-test="chat-tool-item"]').trigger("click");
    expect(wrapper.get('[data-test="chat-tool-input"]').text()).toContain("README.md");
    expect(wrapper.get('[data-test="chat-tool-output"]').text()).toContain("read output");
    expect(items.get('[data-test="chat-tool-item"]').attributes("data-has-suffix")).toBe("false");
  });

  it("keeps an opened activity group expanded when streaming appends activity", async () => {
    const initial = assistantMessage([
      reasoning("inspect", "streaming"),
      streamingTool("tool-1", "Read", "read"),
    ]);
    const wrapper = mountList([initial], "streaming");

    await wrapper.get('[data-test="chat-activity-group"]').trigger("click");
    expect(wrapper.get('[data-test="chat-activity-group"]').attributes("aria-expanded")).toBe(
      "true"
    );

    const appended: UIMessage<MessageMeta> = {
      ...initial,
      parts: [
        reasoning("inspect", "done"),
        dynamicTool("tool-1", "Read", "read output", "read"),
        reasoning("verify", "streaming"),
      ],
    };
    await wrapper.setProps({ messages: [appended] });

    expect(wrapper.get('[data-test="chat-activity-group"]').attributes("aria-expanded")).toBe(
      "true"
    );
    expect(wrapper.findAll('[data-test="chat-activity-reasoning"]')).toHaveLength(2);
    expect(wrapper.findAll('[data-test="chat-tool-item"]')).toHaveLength(1);
  });

  it("groups consecutive pure reasoning but leaves single reasoning and tools direct", () => {
    const reasoningGroup = mountList([assistantMessage([reasoning("first"), reasoning("second")])]);
    expect(reasoningGroup.findAll('[data-test="chat-activity-group"]')).toHaveLength(1);
    expect(
      reasoningGroup.get('[data-test="chat-activity-group"] [data-test="tool-text"]').text()
    ).toBe("Think 2 times");

    const direct = mountList([
      assistantMessage([
        reasoning("one"),
        { type: "text", text: "between" },
        dynamicTool("tool-1", "Read", "done", "read"),
      ]),
    ]);
    expect(direct.find('[data-test="chat-activity-group"]').exists()).toBe(false);
    expect(direct.findAll('[data-test="reasoning"]')).toHaveLength(1);
    expect(direct.findAll('[data-test="chat-tool-item"]')).toHaveLength(1);
    expect(direct.text()).toContain("between");
  });

  it("renders a subagent parent as an isolated card and hides only linked descendants", () => {
    const wrapper = mountList([
      assistantMessage([
        dynamicTool("ordinary-before", "Read", "before", "read"),
        subagentTool("parent", {
          description: "定位 ACP 事件映射相关代码",
          output: "summary",
          status: "completed",
          totalToolUseCount: 1,
        }),
        subagentTool("child", { parentToolCallId: "parent", output: "child output" }),
        dynamicTool("ordinary-after", "Write", "after", "write"),
      ]),
    ]);

    expect(wrapper.findAll('[data-test="subagent-call-card"]')).toHaveLength(1);
    expect(wrapper.get('[data-test="subagent-call-card"]').text()).toContain(
      "定位 ACP 事件映射相关代码"
    );
    expect(wrapper.get('[data-test="subagent-call-card"]').text()).toContain("1 次工具调用");
    expect(wrapper.find('[data-test="chat-activity-group"]').exists()).toBe(false);
    expect(wrapper.findAll('[data-test="chat-tool-item"]')).toHaveLength(2);
    expect(wrapper.text()).not.toContain("child output");
  });

  it("opens a subagent slideover with prompt, upstream metrics, tools and result", async () => {
    const wrapper = mountList([
      assistantMessage([
        subagentTool("parent", {
          description: "定位 ACP 事件映射相关代码",
          prompt: "查找 ACP mapper",
          output: "找到了映射入口",
          status: "completed",
          agentType: "Explore",
          resolvedModel: "claude-sonnet-5",
          totalTokens: 37556,
          totalDurationMs: 28471,
          totalToolUseCount: 1,
          toolStats: { readCount: 0, bashCount: 1 },
        }),
        subagentTool("child", { parentToolCallId: "parent", output: "child output" }),
      ]),
    ]);

    const card = wrapper.get('[data-test="subagent-call-card"]');
    expect(card.element.tagName).toBe("BUTTON");
    expect(card.attributes("aria-expanded")).toBe("false");
    expect(card.get('[data-test="subagent-call-icon"]').attributes("data-icon-name")).toBe(
      "i-lucide-waypoints"
    );
    const agentName = card.get('[data-test="subagent-call-name"]');
    expect(agentName.text()).toBe("定位 ACP 事件映射相关代码");
    expect(agentName.classes()).toEqual(expect.arrayContaining(["text-base", "font-semibold"]));
    const agentType = card.get('[data-test="subagent-agent-type"]');
    expect(agentType.text()).toBe("Explore");
    expect(agentType.classes()).toEqual(expect.arrayContaining(["text-sm", "font-medium"]));
    expect(card.text()).not.toContain("子 Agent");
    await card.trigger("click");

    expect(card.attributes("aria-expanded")).toBe("true");
    const slideover = wrapper.get('[data-test="subagent-slideover"]');
    expect(slideover.text()).toContain("查找 ACP mapper");
    expect(slideover.text()).toContain("claude-sonnet-5");
    expect(slideover.get('[data-test="subagent-tokens"]').text()).toBe("37,556");
    expect(slideover.get('[data-test="subagent-duration"]').text()).toBe("28.5 秒");
    expect(slideover.findAll('[data-test="subagent-tool-entry"]')).toHaveLength(1);
    expect((slideover.get("details").element as HTMLDetailsElement).open).toBe(false);
    expect(slideover.get(".max-h-72").classes()).toContain("overflow-auto");
    expect(slideover.text()).toContain("child output");
    expect(slideover.text()).toContain("找到了映射入口");
    expect(slideover.text()).toContain("读取 0");
  });

  it("keeps an open subagent slideover reactive as the stream completes", async () => {
    const initial = assistantMessage([
      subagentTool("parent", {
        description: "运行子 Agent",
        prompt: "inspect",
        status: "in_progress",
      }),
    ]);
    const wrapper = mountList([initial], "streaming", undefined, "chat", {
      messageId: initial.id,
      startedAt: Date.now(),
    });

    await wrapper.get('[data-test="subagent-call-card"]').trigger("click");
    expect(wrapper.get('[data-test="subagent-tools-waiting"]').text()).toContain(
      "等待子 Agent 工具调用"
    );

    const completed: UIMessage<MessageMeta> = {
      ...initial,
      parts: [
        subagentTool("parent", {
          description: "运行子 Agent",
          prompt: "inspect",
          output: "completed result",
          status: "completed",
          totalTokens: 42,
        }),
        subagentTool("child", { parentToolCallId: "parent", output: "late child" }),
      ],
    };
    await wrapper.setProps({ messages: [completed], status: "ready", streamIndicator: null });

    expect(wrapper.find('[data-test="subagent-slideover"]').exists()).toBe(true);
    expect(wrapper.findAll('[data-test="subagent-tool-entry"]')).toHaveLength(1);
    expect(wrapper.text()).toContain("late child");
    expect(wrapper.text()).toContain("completed result");
    expect(wrapper.get('[data-test="subagent-tokens"]').text()).toBe("42");
  });

  it("isolates parallel subagent details and preserves orphan tools", async () => {
    const wrapper = mountList([
      assistantMessage([
        subagentTool("parent-a", { description: "Agent A", status: "completed", output: "A" }),
        subagentTool("parent-b", { description: "Agent B", status: "completed", output: "B" }),
        subagentTool("child-a", { parentToolCallId: "parent-a", output: "A child" }),
        subagentTool("child-b", { parentToolCallId: "parent-b", output: "B child" }),
        subagentTool("orphan", { parentToolCallId: "missing", output: "orphan output" }),
      ]),
    ]);

    expect(wrapper.findAll('[data-test="subagent-call-card"]')).toHaveLength(2);
    expect(wrapper.find('[data-test="chat-activity-group"]').exists()).toBe(false);
    expect(wrapper.findAll('[data-test="chat-tool-item"]')).toHaveLength(1);
    await wrapper.get('[data-test="chat-tool-item"]').trigger("click");
    expect(wrapper.text()).toContain("orphan output");

    await wrapper.findAll('[data-test="subagent-call-card"]')[0].trigger("click");
    const slideover = wrapper.get('[data-test="subagent-slideover"]');
    expect(slideover.text()).toContain("A child");
    expect(slideover.text()).not.toContain("B child");
  });

  it("shows terminal empty state, interrupted state, collapsed details and restores focus", async () => {
    const message = assistantMessage([
      subagentTool("empty", { description: "No tools", status: "completed", output: "done" }),
      subagentTool("interrupted", { description: "Stopped task" }),
      subagentTool("failed", { description: "Failed task", status: "failed", output: "error" }),
    ]);
    const wrapper = mountList([message]);
    document.body.appendChild(wrapper.element);

    const cards = wrapper.findAll('[data-test="subagent-call-card"]');
    expect(cards[1].text()).toContain("已中断");
    expect(cards[2].text()).toContain("失败");

    (cards[0].element as HTMLElement).focus();
    await cards[0].trigger("click");
    expect(wrapper.get('[data-test="subagent-tools-empty"]').text()).toContain("未记录工具调用");
    await wrapper.get('button[aria-label="关闭子 Agent 详情"]').trigger("click");
    await wrapper.vm.$nextTick();
    expect(document.activeElement).toBe(cards[0].element);

    await cards[1].trigger("click");
    expect(wrapper.get('[data-test="subagent-tools-empty"]').text()).toContain("未记录工具调用");
    expect(wrapper.text()).toContain("未提供最终回复");
    expect(wrapper.find('[data-test="subagent-tools-waiting"]').exists()).toBe(false);

    wrapper.unmount();
  });

  it("keeps Fyllo action contexts on original part indices when activities are grouped", () => {
    const wrapper = mountList([
      assistantMessage([
        { type: "text", text: "action-a" },
        dynamicTool("tool-1", "Read", "read output", "read"),
        dynamicTool("tool-2", "Write", "write output", "write"),
        { type: "text", text: "action-b" },
      ]),
    ]);

    expect(
      wrapper
        .findAll('[data-test="markdown"]')
        .map((node) => node.attributes("data-action-part-index"))
    ).toEqual(["0", "3"]);
  });

  it("renders empty lists and passes status through", () => {
    const wrapper = mountList([], "streaming");

    expect(wrapper.find('[data-test="chat-messages"]').attributes("data-status")).toBe("streaming");
    expect(wrapper.text()).toBe("");
  });

  it("hides reminder parts in user messages but keeps normal text", () => {
    const wrapper = mountList([
      userMessage([
        { type: "text", text: "<system-reminder>\nbody\n</system-reminder>" },
        { type: "text", text: "visible user text" },
      ]),
    ]);

    expect(wrapper.text()).toContain("visible user text");
    expect(wrapper.text()).not.toContain("system-reminder");
  });

  it("collapses overflowing user text parts by default", async () => {
    mockUserTextOverflow((text) => text.includes("long user text"));

    const wrapper = mountList([
      userMessage([{ type: "text", text: "long user text\n".repeat(20) }]),
    ]);

    await vi.waitFor(() => {
      expect(wrapper.get('[data-test="user-message-text-toggle"]').text()).toContain("展开");
    });

    const text = wrapper.get('[data-test="user-message-text"]');
    expect(text.classes()).toContain("max-h-40");
    expect(text.classes()).toContain("overflow-hidden");
    expect(wrapper.get('[data-test="user-message-text-toggle"]').attributes("aria-expanded")).toBe(
      "false"
    );
  });

  it("toggles overflowing user text parts between expanded and collapsed states", async () => {
    mockUserTextOverflow((text) => text.includes("long user text"));

    const wrapper = mountList([
      userMessage([{ type: "text", text: "long user text\n".repeat(20) }]),
    ]);

    await vi.waitFor(() => {
      expect(wrapper.get('[data-test="user-message-text-toggle"]').text()).toContain("展开");
    });

    await wrapper.get('[data-test="user-message-text-toggle"]').trigger("click");

    expect(wrapper.get('[data-test="user-message-text-toggle"]').text()).toContain("收起");
    expect(wrapper.get('[data-test="user-message-text-toggle"]').attributes("aria-expanded")).toBe(
      "true"
    );
    expect(wrapper.get('[data-test="user-message-text"]').classes()).not.toContain("max-h-40");
    expect(wrapper.get('[data-test="user-message-text"]').classes()).not.toContain(
      "overflow-hidden"
    );

    await wrapper.get('[data-test="user-message-text-toggle"]').trigger("click");

    expect(wrapper.get('[data-test="user-message-text-toggle"]').text()).toContain("展开");
    expect(wrapper.get('[data-test="user-message-text-toggle"]').attributes("aria-expanded")).toBe(
      "false"
    );
    expect(wrapper.get('[data-test="user-message-text"]').classes()).toContain("max-h-40");
    expect(wrapper.get('[data-test="user-message-text"]').classes()).toContain("overflow-hidden");
  });

  it("does not render text toggles for user text parts within the collapsed height", async () => {
    mockUserTextOverflow(() => false);

    const wrapper = mountList([userMessage([{ type: "text", text: "short user text" }])]);

    await vi.waitFor(() => {
      expect(wrapper.get('[data-test="user-message-text"]').classes()).not.toContain("max-h-40");
    });

    expect(wrapper.find('[data-test="user-message-text-toggle"]').exists()).toBe(false);
  });

  it("keeps multiple overflowing user text parts independently collapsible", async () => {
    mockUserTextOverflow((text) => text.includes("first long") || text.includes("second long"));

    const wrapper = mountList([
      userMessage([
        { type: "text", text: "first long user text\n".repeat(20) },
        { type: "text", text: "second long user text\n".repeat(20) },
      ]),
    ]);

    await vi.waitFor(() => {
      expect(wrapper.findAll('[data-test="user-message-text-toggle"]')).toHaveLength(2);
    });

    const textParts = wrapper.findAll('[data-test="user-message-text"]');
    const toggles = wrapper.findAll('[data-test="user-message-text-toggle"]');

    await toggles[0].trigger("click");

    expect(toggles[0].text()).toContain("收起");
    expect(toggles[1].text()).toContain("展开");
    expect(textParts[0].classes()).not.toContain("max-h-40");
    expect(textParts[1].classes()).toContain("max-h-40");
  });

  it("does not crash when a user message only contains a reminder", () => {
    const wrapper = mountList([
      userMessage([{ type: "text", text: "<system-reminder>\nbody\n</system-reminder>" }]),
    ]);

    expect(wrapper.text()).not.toContain("system-reminder");
    expect(wrapper.text()).not.toContain("body");
  });

  it("does not filter assistant text that only looks like a reminder", () => {
    const wrapper = mountList([
      {
        id: "assistant-reminder-like",
        role: "assistant",
        parts: [{ type: "text", text: "<system-reminder>\nassistant output\n</system-reminder>" }],
        metadata: { sessionId: "session-1", createdAt: new Date("2026-05-08T00:00:00.000Z") },
      },
    ]);

    expect(wrapper.text()).toContain("assistant output");
  });

  it("resolves file:// image parts through chatApi.readAttachmentDataUrl", async () => {
    const wrapper = mountList([
      userMessage([
        {
          type: "file",
          mediaType: "image/png",
          url: "file:///tmp/%E6%88%AA%E5%9B%BE%201.png",
          filename: "截图 1.png",
        },
      ]),
    ]);

    await vi.waitFor(() => {
      expect(vi.mocked(chatApi.readAttachmentDataUrl)).toHaveBeenCalledWith(
        "file:///tmp/%E6%88%AA%E5%9B%BE%201.png",
        "image/png"
      );
    });
    await vi.waitFor(() => {
      expect(wrapper.get('[data-test="user-message-image-card"] img').attributes("src")).toBe(
        "data:image/png;base64,AAAA"
      );
    });
  });

  it("uses non-file image URLs directly without IPC", () => {
    const wrapper = mountList([
      userMessage([
        {
          type: "file",
          mediaType: "image/png",
          url: "data:image/png;base64,BBBB",
          filename: "inline.png",
        },
      ]),
    ]);

    expect(vi.mocked(chatApi.readAttachmentDataUrl)).not.toHaveBeenCalled();
    expect(wrapper.get('[data-test="user-message-image-card"] img').attributes("src")).toBe(
      "data:image/png;base64,BBBB"
    );
  });

  it("renders non-image file parts as file cards", () => {
    const wrapper = mountList([
      userMessage([
        {
          type: "file",
          mediaType: "application/pdf",
          url: "file:///tmp/doc.pdf",
          filename: "doc.pdf",
        },
      ]),
    ]);

    const card = wrapper.get('[data-test="user-message-file-card"]');
    expect(card.text()).toContain("doc.pdf");
    expect(card.text()).toContain("PDF");
  });
});
