import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import MarkStream from "@renderer/components/shared/MarkStream.vue";
import AssistantMessage from "@renderer/components/chat/message/AssistantMessage.vue";
import { fylloActionMarkstreamCustomHtmlTags } from "@renderer/features/fyllo-action/integration";
import { fylloSignalMarkstreamCustomHtmlTags } from "@renderer/features/fyllo-signal/integration";
import type { UIMessage } from "ai";

const markstreamMocks = vi.hoisted(() => ({
  setCustomComponents: vi.fn(),
  removeCustomComponents: vi.fn(),
}));

vi.mock("markstream-vue", () => ({
  default: {
    name: "MarkdownRender",
    props: [
      "customId",
      "customHtmlTags",
      "parseOptions",
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
      "enableSignals",
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

vi.mock("@renderer/features/fyllo-signal/ui/FylloSignalNode.vue", () => ({
  default: {
    name: "FylloSignalNode",
    template: "<span />",
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

function actionContext() {
  const registerAction = vi.fn().mockResolvedValue({
    type: "task.create" as const,
    status: "ready" as const,
    revision: 1,
    updatedAt: "2026-07-15T00:00:00.000Z",
  });
  const persistActionState = vi.fn().mockResolvedValue(undefined);

  return {
    context: {
      projectId: "project-1",
      sessionId: "session-1",
      messageIndex: 2,
      partIndex: 0,
      registerAction,
      persistActionState,
      transitionAction: vi.fn(),
      transitionActions: vi.fn(),
    },
    registerAction,
    persistActionState,
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
      fylloActionMarkstreamCustomHtmlTags[0]
    );
    expect(markstreamMocks.setCustomComponents).toHaveBeenCalledWith(
      "message-1",
      expect.objectContaining({
        [fylloActionMarkstreamCustomHtmlTags[0]]: expect.any(Object),
      })
    );
  });

  it("composes Action and Signal custom tags and render-only content", () => {
    const wrapper = mount(MarkStream, {
      props: {
        id: "message-1",
        content: [
          '<fyllo-action type="task.create">{"title":"ready"}</fyllo-action>',
          '<fyllo-signal type="show.time">{"label":"2026-07-24 10:30"}</fyllo-signal>',
        ].join("\n\n"),
        isStreaming: false,
        isDark: false,
        enableActions: true,
        enableSignals: true,
      },
    });

    const renderer = wrapper.get('[data-test="markdown-render"]');
    expect(renderer.attributes("data-tags")).toBe(
      `${fylloActionMarkstreamCustomHtmlTags[0]},${fylloSignalMarkstreamCustomHtmlTags[0]}`
    );
    expect(renderer.text()).toContain("<fyllo-action-render");
    expect(renderer.text()).toContain("<fyllo-signal-render");
    expect(markstreamMocks.setCustomComponents).toHaveBeenCalledWith(
      "message-1",
      expect.objectContaining({
        [fylloActionMarkstreamCustomHtmlTags[0]]: expect.any(Object),
        [fylloSignalMarkstreamCustomHtmlTags[0]]: expect.any(Object),
      })
    );
  });

  it("keeps an unclosed Signal as ordinary Markdown without a custom node", () => {
    const source = '<fyllo-signal type="show.time">{"label":"streaming"}';
    const wrapper = mount(MarkStream, {
      props: {
        id: "message-1",
        content: source,
        isStreaming: true,
        isDark: false,
        enableSignals: true,
      },
    });

    const renderer = wrapper.get('[data-test="markdown-render"]');
    expect(renderer.text()).not.toContain("<fyllo-signal-render");
    const markdownRender = wrapper.getComponent({ name: "MarkdownRender" });
    const parseOptions = markdownRender.props("parseOptions") as {
      postTransformNodes: (
        nodes: Array<{ type: string; content: string }>
      ) => Array<{ type: string; content: string }>;
    };
    const [restored] = parseOptions.postTransformNodes([
      { type: "text", content: markdownRender.props("content") as string },
    ]);
    expect(restored.content).toBe(source);
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
        [fylloActionMarkstreamCustomHtmlTags[0]]: expect.any(Object),
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

  it("registers a closed ready action without waiting for confirmation", async () => {
    const { context, registerAction, persistActionState } = actionContext();
    const wrapper = mount(MarkStream, {
      props: {
        id: "message-1",
        content: '<fyllo-action type="task.create">{"title":"ready"}',
        isStreaming: true,
        isDark: false,
        enableActions: true,
        actionContext: context,
      },
    });

    await flushPromises();
    expect(registerAction).not.toHaveBeenCalled();

    await wrapper.setProps({
      content: '<fyllo-action type="task.create">{"title":"ready"}</fyllo-action>',
      isStreaming: false,
    });
    await flushPromises();

    expect(registerAction).toHaveBeenCalledTimes(1);
    expect(registerAction).toHaveBeenCalledWith({
      projectId: "project-1",
      sessionId: "session-1",
      actionId: "chat:session-1:2:0:0",
      type: "task.create",
    });
    expect(persistActionState).toHaveBeenCalledWith("chat:session-1:2:0:0", {
      type: "task.create",
      status: "ready",
      revision: 1,
      updatedAt: "2026-07-15T00:00:00.000Z",
    });

    await wrapper.setProps({ isStreaming: true });
    await wrapper.setProps({ isStreaming: false });
    await flushPromises();
    expect(registerAction).toHaveBeenCalledTimes(1);
  });

  it("skips ready registration when the action already has persisted state", async () => {
    const { context, registerAction } = actionContext();
    mount(MarkStream, {
      props: {
        id: "message-1",
        content: '<fyllo-action type="task.create">{"title":"ready"}</fyllo-action>',
        isStreaming: false,
        isDark: false,
        enableActions: true,
        actionContext: {
          ...context,
          actionStates: {
            "chat:session-1:2:0:0": {
              type: "task.create",
              status: "ready",
              revision: 1,
              updatedAt: "2026-07-15T00:00:00.000Z",
            },
          },
        },
      },
    });
    await flushPromises();

    expect(registerAction).not.toHaveBeenCalled();
  });
});

describe("AssistantMessage Fyllo action enablement", () => {
  it("enables actions for text parts and renders reasoning without MarkStream", () => {
    const wrapper = mount(AssistantMessage, {
      props: {
        message: assistantMessage(),
        isDark: false,
        enableActions: true,
        enableSignals: true,
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
              enableSignals: Boolean,
              actionContext: Object,
            },
            template:
              '<div data-test="markstream" :data-content="content" :data-enable-actions="String(enableActions)" :data-enable-signals="String(enableSignals)" :data-project-id="actionContext?.projectId ?? \'\'" :data-session-id="actionContext?.sessionId ?? \'\'" :data-message-index="String(actionContext?.messageIndex ?? \'\')" :data-part-index="String(actionContext?.partIndex ?? \'\')"></div>',
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
    expect(textPart?.attributes("data-enable-signals")).toBe("true");
    expect(textPart?.attributes("data-session-id")).toBe("session-1");
    expect(textPart?.attributes("data-message-index")).toBe("0");
    expect(textPart?.attributes("data-part-index")).toBe("1");
  });

  it("enables Signals for text even when no Action context can be built", () => {
    const wrapper = mount(AssistantMessage, {
      props: {
        message: assistantMessage(),
        isDark: false,
        enableActions: true,
        enableSignals: true,
      },
      global: {
        plugins: [createPinia()],
        stubs: {
          MarkStream: {
            props: ["enableActions", "enableSignals"],
            template:
              '<div data-test="markstream" :data-enable-actions="String(enableActions)" :data-enable-signals="String(enableSignals)" />',
          },
          UChatReasoning: true,
          UChatTool: true,
        },
      },
    });

    const markstream = wrapper.get('[data-test="markstream"]');
    expect(markstream.attributes("data-enable-actions")).toBe("false");
    expect(markstream.attributes("data-enable-signals")).toBe("true");
  });
});
