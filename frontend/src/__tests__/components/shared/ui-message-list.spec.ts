import { describe, expect, it, beforeEach } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import UIMessageList from "@renderer/components/shared/UIMessageList.vue";
import type { ChatStatus, MessageMeta } from "@shared/types/chat";
import type { UIMessage } from "ai";

function textMessage(): UIMessage<MessageMeta> {
  return {
    id: "message-1",
    role: "assistant",
    parts: [{ type: "text", text: "hello" }],
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

  return mount(UIMessageList, {
    props: {
      messages,
      status,
      type: "chat",
      agentId,
    },
    global: {
      plugins: [createPinia()],
      stubs: {
        ChatComark: {
          props: ["markdown"],
          template: '<div data-test="markdown">{{ markdown }}</div>',
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
});
