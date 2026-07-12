import { flushPromises, mount, type DOMWrapper, type VueWrapper } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FylloActionNode from "@renderer/components/shared/markstream/FylloActionNode.vue";
import type { FylloActionHandlerResult } from "@shared/types/fyllo-action";
import {
  createFylloActionOrdinalResolver,
  fylloActionHostContextKey,
} from "@renderer/components/shared/markstream/fyllo-action-context";

const dispatchMock = vi.hoisted(() => vi.fn());

vi.mock("@renderer/composables/useFylloActionDispatcher", () => ({
  useFylloActionDispatcher: () => ({
    dispatchFylloAction: dispatchMock,
  }),
}));

function buttonByText(wrapper: VueWrapper, text: string): DOMWrapper<HTMLButtonElement> {
  const button = wrapper.findAll("button").find((node) => node.text() === text);
  if (!button) {
    throw new Error(`Missing button: ${text}`);
  }
  return button as DOMWrapper<HTMLButtonElement>;
}

describe("FylloActionNode", () => {
  beforeEach(() => {
    dispatchMock.mockReset();
    dispatchMock.mockResolvedValue({ outcome: "succeeded" } satisfies FylloActionHandlerResult);
  });

  it("routes task.create to the task-specific renderer and generic dispatcher", async () => {
    const wrapper = mount(FylloActionNode, {
      props: {
        node: {
          attrs: {
            type: "task.create",
          },
          content: '{"title":"补齐错误处理","description":"整理异常分支"}',
        },
      },
    });

    expect(wrapper.text()).toContain("创建任务");
    expect(wrapper.text()).toContain("任务标题");
    expect(wrapper.text()).toContain("补齐错误处理");
    expect(wrapper.text()).toContain("任务描述");
    expect(wrapper.text()).toContain("整理异常分支");

    await buttonByText(wrapper, "确认").trigger("click");
    await flushPromises();

    expect(dispatchMock).toHaveBeenCalledWith(
      "task.create",
      {
        title: "补齐错误处理",
        description: "整理异常分支",
      },
      { sessionId: undefined }
    );
  });

  it("persists ready action state with deterministic transcript action id", async () => {
    const persistActionState = vi.fn().mockResolvedValue(undefined);
    const wrapper = mount(FylloActionNode, {
      props: {
        node: {
          raw: '<fyllo-action type="task.create">{"title":"补齐错误处理"}</fyllo-action>',
          attrs: {
            type: "task.create",
          },
          content: '{"title":"补齐错误处理"}',
        },
      },
      global: {
        provide: {
          [fylloActionHostContextKey as symbol]: {
            sessionId: "session-1",
            messageIndex: 3,
            partIndex: 0,
            resolveActionOrdinal: () => 0,
            getActionState: () => undefined,
            persistActionState,
          },
        },
      },
    });

    await buttonByText(wrapper, "确认").trigger("click");
    await flushPromises();

    expect(dispatchMock).toHaveBeenCalledWith(
      "task.create",
      {
        title: "补齐错误处理",
      },
      { sessionId: "session-1", actionId: "chat:session-1:3:0:0" }
    );
    expect(persistActionState).toHaveBeenCalledWith("chat:session-1:3:0:0", {
      type: "task.create",
      status: "succeeded",
      updatedAt: expect.any(String),
    });
  });

  it("routes knowledge.flag through the generic dispatcher with action id context", async () => {
    const persistActionState = vi.fn().mockResolvedValue(undefined);
    const wrapper = mount(FylloActionNode, {
      props: {
        node: {
          raw: '<fyllo-action type="knowledge.flag">{"summary":"Theme subscriptions are expensive.","contextPaths":["src/renderer/src/components/chat/MessageMarkdown.vue"]}</fyllo-action>',
          attrs: {
            type: "knowledge.flag",
          },
          content:
            '{"summary":"Theme subscriptions are expensive.","contextPaths":["src/renderer/src/components/chat/MessageMarkdown.vue"]}',
        },
      },
      global: {
        provide: {
          [fylloActionHostContextKey as symbol]: {
            sessionId: "session-1",
            messageIndex: 4,
            partIndex: 0,
            resolveActionOrdinal: () => 0,
            getActionState: () => undefined,
            persistActionState,
          },
        },
      },
    });

    expect(wrapper.text()).toContain("发现可沉淀知识");
    expect(wrapper.text()).toContain("Theme subscriptions are expensive.");

    await buttonByText(wrapper, "沉淀知识").trigger("click");
    await flushPromises();

    expect(dispatchMock).toHaveBeenCalledWith(
      "knowledge.flag",
      {
        summary: "Theme subscriptions are expensive.",
        contextPaths: ["src/renderer/src/components/chat/MessageMarkdown.vue"],
      },
      { sessionId: "session-1", actionId: "chat:session-1:4:0:0" }
    );
    expect(persistActionState).toHaveBeenCalledWith("chat:session-1:4:0:0", {
      type: "knowledge.flag",
      status: "succeeded",
      updatedAt: expect.any(String),
    });
  });

  it("routes knowledge.review by entry name through the generic dispatcher", async () => {
    const persistActionState = vi.fn().mockResolvedValue(undefined);
    const wrapper = mount(FylloActionNode, {
      props: {
        node: {
          raw: '<fyllo-action type="knowledge.review">{"name":"markstream-vue-theme-subscription","summary":"Review saved markdown."}</fyllo-action>',
          attrs: {
            type: "knowledge.review",
          },
          content:
            '{"name":"markstream-vue-theme-subscription","summary":"Review saved markdown."}',
        },
      },
      global: {
        provide: {
          [fylloActionHostContextKey as symbol]: {
            sessionId: "session-1",
            messageIndex: 5,
            partIndex: 0,
            resolveActionOrdinal: () => 0,
            getActionState: () => undefined,
            persistActionState,
          },
        },
      },
    });

    expect(wrapper.text()).toContain("审阅知识");
    expect(wrapper.text()).toContain("markstream-vue-theme-subscription");
    expect(wrapper.text()).toContain("Review saved markdown.");

    await buttonByText(wrapper, "审阅知识").trigger("click");
    await flushPromises();

    expect(dispatchMock).toHaveBeenCalledWith(
      "knowledge.review",
      {
        name: "markstream-vue-theme-subscription",
        summary: "Review saved markdown.",
      },
      { sessionId: "session-1", actionId: "chat:session-1:5:0:0" }
    );
    expect(persistActionState).toHaveBeenCalledWith("chat:session-1:5:0:0", {
      type: "knowledge.review",
      status: "succeeded",
      updatedAt: expect.any(String),
    });
  });

  it("allocates action ordinals by source order, including repeated payloads", () => {
    const resolveOrdinal = createFylloActionOrdinalResolver(
      [
        '<fyllo-action type="task.create">{"title":"A"}</fyllo-action>',
        '<fyllo-action type="task.create">{"title":"A"}</fyllo-action>',
      ].join("\n")
    );

    expect(resolveOrdinal({ content: '{"title":"A"}' })).toBe(0);
    expect(resolveOrdinal({ content: '{"title":"A"}' })).toBe(1);
  });
});
