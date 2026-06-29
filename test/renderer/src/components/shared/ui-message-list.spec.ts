import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import ChatMessageList from "@renderer/components/chat/message/ChatMessageList.vue";
import { chatApi } from "@renderer/api/chat";
import type { ChatStatus, MessageMeta } from "@shared/types/chat";
import type { DynamicToolUIPart, UIMessage } from "ai";

vi.mock("@renderer/api/chat", () => ({
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
  toolKind?: string
): DynamicToolUIPart {
  return {
    type: "dynamic-tool",
    toolCallId,
    toolName,
    state: "output-available",
    input: {},
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

function mountList(
  messages: UIMessage<MessageMeta>[],
  status: ChatStatus = "ready",
  agentId?: string,
  type: "chat" | "side" = "chat"
): VueWrapper {
  const chatMessagesStub = {
    props: ["messages", "status", "user", "assistant"],
    template:
      '<div data-test="chat-messages" :data-status="status"><div v-for="message in messages" :key="message.id"><slot name="content" :message="message" /><slot name="actions" :message="message" /></div></div>',
  };
  const chatToolStub = {
    props: ["text", "suffix", "streaming", "icon", "open", "variant", "ui"],
    emits: ["update:open"],
    template:
      '<div data-test="tool" :data-streaming="String(streaming)" :data-icon="icon" :data-variant="variant" :data-ui-content="ui?.content ?? \'\'" @click="$emit(\'update:open\', !open)"><span data-test="tool-text">{{ text }}</span><span data-test="tool-suffix">{{ suffix }}</span><slot v-if="open === undefined || open" /></div>',
  };
  const chatReasoningStub = {
    template: "<div><slot /></div>",
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
    },
    global: {
      plugins: [createPinia()],
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

  it("renders dynamic tool parts", () => {
    const wrapper = mountList([assistantMessage([dynamicTool("tool-1", "Read", "done", "read")])]);

    expect(wrapper.text()).toContain("done");
    expect(wrapper.get('[data-test="tool"]').attributes("data-icon")).toBe("i-lucide-file-text");
  });

  it("collapses consecutive tool parts into one tool group summary", () => {
    const wrapper = mountList([
      assistantMessage([
        dynamicTool("tool-1", "Read", "read output", "read"),
        dynamicTool("tool-2", "Write", "write output", "write"),
      ]),
    ]);

    expect(wrapper.findAll('[data-test="chat-tool-group"]')).toHaveLength(1);
    const group = wrapper.get('[data-test="chat-tool-group"]');
    expect(group.get('[data-test="tool-text"]').text()).toBe("Read 1 file, Write 1 file");
    expect(group.attributes("data-icon")).toBe("i-lucide-file-plus");
    expect(wrapper.findAll('[data-test="tool"]')).toHaveLength(0);
  });

  it("uses the last streaming tool icon for a tool group header", () => {
    const wrapper = mountList([
      assistantMessage([
        streamingTool("tool-1", "Read", "read"),
        streamingTool("tool-2", "Write", "write"),
      ]),
    ]);

    const group = wrapper.get('[data-test="chat-tool-group"]');
    expect(group.attributes("data-streaming")).toBe("true");
    expect(group.attributes("data-icon")).toBe("i-lucide-file-plus");
  });

  it("uses the other icon for historical tool groups without metadata", () => {
    const wrapper = mountList([
      assistantMessage([
        dynamicTool("tool-1", "Read", "read output"),
        dynamicTool("tool-2", "Write", "write output"),
      ]),
    ]);

    const group = wrapper.get('[data-test="chat-tool-group"]');
    expect(group.get('[data-test="tool-text"]').text()).toBe("Run 2 tools");
    expect(group.attributes("data-icon")).toBe("i-lucide-wrench");
  });

  it("passes kind icons to expanded tool group items", async () => {
    const wrapper = mountList([
      assistantMessage([
        dynamicTool("tool-1", "Read", "read output", "read"),
        dynamicTool("tool-2", "Write", "write output", "write"),
      ]),
    ]);

    await wrapper.get('[data-test="chat-tool-group"]').trigger("click");

    expect(
      wrapper.findAll('[data-test="tool"]').map((node) => node.attributes("data-icon"))
    ).toEqual(["i-lucide-file-text", "i-lucide-file-plus"]);
  });

  it("expands a tool group and shows original tool outputs", async () => {
    const wrapper = mountList([
      assistantMessage([
        dynamicTool("tool-1", "Read", "read output", "read"),
        dynamicTool("tool-2", "Write", "write output", "write"),
      ]),
    ]);

    await wrapper.get('[data-test="chat-tool-group"]').trigger("click");

    expect(wrapper.findAll('[data-test="tool"]')).toHaveLength(2);
    expect(wrapper.text()).toContain("Read");
    expect(wrapper.text()).toContain("Write");
    expect(wrapper.text()).toContain("read output");
    expect(wrapper.text()).toContain("write output");
  });

  it("summarizes historical tool groups without metadata as run tools", async () => {
    const wrapper = mountList([
      assistantMessage([
        dynamicTool("tool-1", "Read", "read output"),
        dynamicTool("tool-2", "Write", "write output"),
      ]),
    ]);

    expect(wrapper.get('[data-test="chat-tool-group"] [data-test="tool-text"]').text()).toBe(
      "Run 2 tools"
    );

    await wrapper.get('[data-test="chat-tool-group"]').trigger("click");

    expect(wrapper.findAll('[data-test="tool"]')).toHaveLength(2);
    expect(wrapper.text()).toContain("read output");
    expect(wrapper.text()).toContain("write output");
  });

  it("does not collapse single tools or tool runs interrupted by text", () => {
    const singleWrapper = mountList([assistantMessage([dynamicTool("tool-1", "Read", "done")])]);
    expect(singleWrapper.find('[data-test="chat-tool-group"]').exists()).toBe(false);
    expect(singleWrapper.findAll('[data-test="tool"]')).toHaveLength(1);

    const interruptedWrapper = mountList([
      assistantMessage([
        dynamicTool("tool-1", "Read", "read output", "read"),
        { type: "text", text: "between" },
        dynamicTool("tool-2", "Write", "write output", "write"),
      ]),
    ]);
    expect(interruptedWrapper.find('[data-test="chat-tool-group"]').exists()).toBe(false);
    expect(interruptedWrapper.findAll('[data-test="tool"]')).toHaveLength(2);
    expect(interruptedWrapper.text()).toContain("between");
  });

  it("keeps Fyllo action contexts on original part indices when tools are grouped", () => {
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
