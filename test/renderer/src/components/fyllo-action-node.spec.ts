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
    dispatchMock.mockResolvedValue({ ok: true } satisfies FylloActionHandlerResult);
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
      { sessionId: "session-1" }
    );
    expect(persistActionState).toHaveBeenCalledWith("chat:session-1:3:0:0", {
      type: "task.create",
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
