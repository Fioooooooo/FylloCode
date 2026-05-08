import { describe, expect, it } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import UIMessageList from "@renderer/components/shared/UIMessageList.vue";
import type { MessageMeta } from "@shared/types/chat";
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

function mountList(messages: UIMessage<MessageMeta>[], isStreaming = false): VueWrapper {
  return mount(UIMessageList, {
    props: {
      messages,
      isStreaming,
      type: "chat",
    },
    global: {
      stubs: {
        ChatComark: {
          props: ["markdown"],
          template: '<div data-test="markdown">{{ markdown }}</div>',
        },
        UChatMessages: {
          props: ["messages"],
          template:
            '<div><div v-for="message in messages" :key="message.id"><slot name="content" :message="message" /></div></div>',
        },
        UChatTool: {
          template: '<div data-test="tool"><slot /></div>',
        },
        UChatReasoning: {
          template: "<div><slot /></div>",
        },
      },
    },
  });
}

describe("UIMessageList", () => {
  it("renders text parts", () => {
    const wrapper = mountList([textMessage()]);

    expect(wrapper.text()).toContain("hello");
  });

  it("renders dynamic tool parts", () => {
    const wrapper = mountList([toolMessage()]);

    expect(wrapper.text()).toContain("done");
  });

  it("renders empty lists and streaming indicator", () => {
    const wrapper = mountList([], true);

    expect(wrapper.text()).toContain("正在执行");
  });
});
