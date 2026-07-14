import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import MarkStream from "@renderer/components/shared/MarkStream.vue";
import AssistantMessage from "@renderer/components/chat/message/AssistantMessage.vue";
import type { UIMessage } from "ai";

const markstreamMocks = vi.hoisted(() => ({
  setCustomComponents: vi.fn(),
  removeCustomComponents: vi.fn(),
}));

vi.mock("markstream-vue", () => ({
  default: {
    props: [
      "customId",
      "customHtmlTags",
      "content",
      "final",
      "fade",
      "typewriter",
      "smoothStreaming",
      "maxLiveNodes",
      "batchRendering",
      "renderBatchSize",
      "renderBatchDelay",
      "renderBatchBudgetMs",
      "isDark",
    ],
    template:
      '<div data-test="markdown-render" :data-custom-id="customId" :data-tags="customHtmlTags ? customHtmlTags.join(\',\') : \'\'">{{ content }}</div>',
  },
  setCustomComponents: markstreamMocks.setCustomComponents,
  removeCustomComponents: markstreamMocks.removeCustomComponents,
}));

vi.mock("@renderer/features/fyllo-action/ui/FylloActionNode.vue", () => ({
  default: {
    name: "FylloActionNode",
    template: "<div />",
  },
}));

function assistantMessage(): UIMessage {
  return {
    id: "message-1",
    role: "assistant",
    parts: [
      {
        type: "reasoning",
        text: '<fyllo-action type="task.create">{"title":"reasoning"}</fyllo-action>',
      },
      {
        type: "text",
        text: '<fyllo-action type="task.create">{"title":"text"}</fyllo-action>',
      },
    ],
  };
}

describe("MarkStream Fyllo action integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  it("registers scoped custom components and passes custom HTML tags when enabled", () => {
    const wrapper = mount(MarkStream, {
      props: {
        id: "message-1",
        content: "content",
        isStreaming: false,
        isDark: false,
        enableActions: true,
      },
    });

    expect(wrapper.get('[data-test="markdown-render"]').attributes("data-tags")).toBe(
      "fyllo-action"
    );
    expect(markstreamMocks.setCustomComponents).toHaveBeenCalledWith(
      "message-1",
      expect.objectContaining({
        "fyllo-action": expect.any(Object),
      })
    );
  });

  it("cleans the previous scoped custom component mapping when id changes", async () => {
    const wrapper = mount(MarkStream, {
      props: {
        id: "message-1",
        content: "content",
        isStreaming: false,
        isDark: false,
        enableActions: true,
      },
    });

    await wrapper.setProps({ id: "message-2" });

    expect(markstreamMocks.removeCustomComponents).toHaveBeenCalledWith("message-1");
    expect(markstreamMocks.setCustomComponents).toHaveBeenLastCalledWith(
      "message-2",
      expect.objectContaining({
        "fyllo-action": expect.any(Object),
      })
    );
  });

  it("cleans scoped custom components on unmount", () => {
    const wrapper = mount(MarkStream, {
      props: {
        id: "message-1",
        content: "content",
        isStreaming: false,
        isDark: false,
        enableActions: true,
      },
    });

    wrapper.unmount();

    expect(markstreamMocks.removeCustomComponents).toHaveBeenCalledWith("message-1");
  });
});

describe("AssistantMessage Fyllo action enablement", () => {
  it("enables actions for text parts and renders reasoning without MarkStream", () => {
    const wrapper = mount(AssistantMessage, {
      props: {
        message: assistantMessage(),
        isDark: false,
        enableActions: true,
        sessionId: "session-1",
        messageIndex: 0,
        projectId: "project-1",
      },
      global: {
        plugins: [createPinia()],
        stubs: {
          MarkStream: {
            props: {
              id: String,
              content: String,
              isStreaming: Boolean,
              isDark: Boolean,
              enableActions: Boolean,
              actionContext: Object,
            },
            template:
              '<div data-test="markstream" :data-content="content" :data-enable-actions="String(enableActions)" :data-project-id="actionContext?.projectId ?? \'\'" :data-session-id="actionContext?.sessionId ?? \'\'" :data-message-index="String(actionContext?.messageIndex ?? \'\')" :data-part-index="String(actionContext?.partIndex ?? \'\')"></div>',
          },
          UChatReasoning: true,
          UChatTool: {
            template: "<div><slot /></div>",
          },
        },
      },
    });

    const markstreams = wrapper.findAll('[data-test="markstream"]');
    const textPart = markstreams.find((node) => node.attributes("data-enable-actions") === "true");
    const reasoningBody = wrapper.get('[data-slot="body"]');

    expect(markstreams).toHaveLength(1);
    expect(reasoningBody.text()).toContain("reasoning");
    expect(textPart?.attributes("data-content")).toContain("text");
    expect(textPart?.attributes("data-session-id")).toBe("session-1");
    expect(textPart?.attributes("data-message-index")).toBe("0");
    expect(textPart?.attributes("data-part-index")).toBe("1");
  });
});
