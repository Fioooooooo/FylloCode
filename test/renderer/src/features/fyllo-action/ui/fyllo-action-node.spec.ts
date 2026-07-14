import { flushPromises, mount, type DOMWrapper, type VueWrapper } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import FylloActionNode from "@renderer/features/fyllo-action/ui/FylloActionNode.vue";
import type { FylloActionHandlerResult } from "@shared/fyllo-action/protocol";
import { createFylloActionOrdinalResolver } from "@renderer/features/fyllo-action";
import { fylloActionHostContextKey } from "@renderer/features/fyllo-action/ui/fyllo-action-context";

const dispatchMock = vi.hoisted(() => vi.fn());
const transitionActionMock = vi.hoisted(() => vi.fn());
const transitionActionsMock = vi.hoisted(() => vi.fn());

vi.mock("@renderer/features/fyllo-action/application/use-fyllo-action-dispatcher", () => ({
  useFylloActionDispatcher: () => ({
    dispatchFylloAction: dispatchMock,
  }),
}));

vi.mock("@renderer/api/session/action", () => ({
  sessionActionApi: {
    transitionAction: transitionActionMock,
    transitionActions: transitionActionsMock,
  },
}));

function buttonByText(wrapper: VueWrapper, text: string): DOMWrapper<HTMLButtonElement> {
  const button = wrapper.findAll("button").find((node) => node.text() === text);
  if (!button) {
    throw new Error(`Missing button: ${text}`);
  }
  return button as DOMWrapper<HTMLButtonElement>;
}

function createHostContext(persistActionState = vi.fn().mockResolvedValue(undefined)) {
  return {
    projectId: "project-1",
    sessionId: "session-1",
    messageIndex: 3,
    partIndex: 0,
    resolveActionOrdinal: () => 0,
    getActionState: () => undefined,
    persistActionState: persistActionState,
    transitionAction: transitionActionMock,
    transitionActions: transitionActionsMock,
  };
}

describe("FylloActionNode", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    dispatchMock.mockReset();
    dispatchMock.mockResolvedValue({ outcome: "succeeded" } satisfies FylloActionHandlerResult);
    transitionActionMock.mockReset();
    transitionActionMock.mockResolvedValue({
      type: "task.create",
      status: "succeeded",
      revision: 2,
      updatedAt: new Date().toISOString(),
    });
    transitionActionsMock.mockReset();
    transitionActionsMock.mockResolvedValue([]);
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
      global: {
        provide: {
          [fylloActionHostContextKey as symbol]: createHostContext(),
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
      {
        projectId: "project-1",
        sessionId: "session-1",
        actionId: "chat:session-1:3:0:0",
      }
    );
  });

  it("persists ready action state with deterministic transcript action id", async () => {
    const persistActionState = vi.fn().mockResolvedValue(undefined);
    const updatedAt = new Date().toISOString();
    transitionActionMock.mockResolvedValue({
      type: "task.create",
      status: "succeeded",
      revision: 2,
      updatedAt,
    });

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
          [fylloActionHostContextKey as symbol]: createHostContext(persistActionState),
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
      {
        projectId: "project-1",
        sessionId: "session-1",
        actionId: "chat:session-1:3:0:0",
      }
    );
    expect(transitionActionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project-1",
        sessionId: "session-1",
        actionId: "chat:session-1:3:0:0",
        command: "succeed",
      })
    );
    expect(persistActionState).toHaveBeenCalledWith("chat:session-1:3:0:0", {
      type: "task.create",
      status: "succeeded",
      revision: 2,
      updatedAt,
    });
  });

  it("routes knowledge.flag through the generic dispatcher with action id context", async () => {
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
          [fylloActionHostContextKey as symbol]: createHostContext(),
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
      {
        projectId: "project-1",
        sessionId: "session-1",
        actionId: "chat:session-1:3:0:0",
      }
    );
  });

  it("routes knowledge.review by entry name through the generic dispatcher", async () => {
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
          [fylloActionHostContextKey as symbol]: createHostContext(),
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
      {
        projectId: "project-1",
        sessionId: "session-1",
        actionId: "chat:session-1:3:0:0",
      }
    );
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
