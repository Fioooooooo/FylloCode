import { describe, expect, it, beforeEach, vi } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import ChatMessageList from "@renderer/components/chat/message/ChatMessageList.vue";
import { chatApi } from "@renderer/api/chat";
import type { ChatStatus, MessageMeta } from "@shared/types/chat";
import type { UIMessage } from "ai";

vi.mock("@renderer/api/chat", () => ({
  chatApi: {
    readAttachmentDataUrl: vi.fn(),
  },
}));

function textMessage(): UIMessage<MessageMeta> {
  return {
    id: "message-1",
    role: "assistant",
    parts: [{ type: "text", text: "hello" }],
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

function toolMessage(): UIMessage<MessageMeta> {
  return {
    id: "message-2",
    role: "assistant",
    parts: [
      {
        type: "dynamic-tool",
        toolCallId: "tool-1",
        toolName: "Read",
        state: "output-available",
        input: {},
        output: "done",
      },
    ],
    metadata: { sessionId: "session-1", createdAt: new Date("2026-05-08T00:00:00.000Z") },
  };
}

function mountList(
  messages: UIMessage<MessageMeta>[],
  status: ChatStatus = "ready",
  agentId?: string
): VueWrapper {
  const chatMessagesStub = {
    props: ["messages", "status"],
    template:
      '<div data-test="chat-messages" :data-status="status"><div v-for="message in messages" :key="message.id"><slot name="content" :message="message" /></div></div>',
  };
  const chatToolStub = {
    template: '<div data-test="tool"><slot /></div>',
  };
  const chatReasoningStub = {
    template: "<div><slot /></div>",
  };

  return mount(ChatMessageList, {
    props: {
      messages,
      status,
      type: "chat",
      agentId,
    },
    global: {
      plugins: [createPinia()],
      stubs: {
        MarkStream: {
          props: ["content", "isStreaming", "isDark"],
          template: '<div data-test="markdown">{{ content }}</div>',
        },
        UChatMessages: chatMessagesStub,
        ChatMessages: chatMessagesStub,
        UChatTool: chatToolStub,
        ChatTool: chatToolStub,
        UChatReasoning: chatReasoningStub,
        ChatReasoning: chatReasoningStub,
      },
    },
  });
}

describe("UIMessageList", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    vi.mocked(chatApi.readAttachmentDataUrl).mockResolvedValue({
      ok: true,
      data: { dataUrl: "data:image/png;base64,AAAA" },
    });
  });

  it("renders text parts", () => {
    const wrapper = mountList([textMessage()]);

    expect(wrapper.text()).toContain("hello");
  });

  it("renders dynamic tool parts", () => {
    const wrapper = mountList([toolMessage()]);

    expect(wrapper.text()).toContain("done");
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

  it("does not crash when a user message only contains a reminder", () => {
    const wrapper = mountList([
      userMessage([{ type: "text", text: "<system-reminder>\nbody\n</system-reminder>" }]),
    ]);

    expect(wrapper.text()).toBe("");
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
});
