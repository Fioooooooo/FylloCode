import { h } from "vue";
import { flushPromises, mount, type DOMWrapper, type VueWrapper } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import FylloActionShell from "@renderer/components/shared/markstream/FylloActionShell.vue";
import { getFylloActionDefinition } from "@renderer/config/fyllo-actions";
import type {
  FylloActionHandlerResult,
  FylloActionParseResult,
  FylloActionPayload,
} from "@shared/types/fyllo-action";

const taskCreateDefinition = getFylloActionDefinition("task.create");
const knowledgeFlagDefinition = getFylloActionDefinition("knowledge.flag");

function readyResult(overrides: Partial<FylloActionParseResult> = {}): FylloActionParseResult {
  return {
    status: "ready",
    type: "task.create",
    payload: {
      title: "补齐错误处理",
      description: "整理异常分支",
    },
    ...overrides,
  } as FylloActionParseResult;
}

function payloadLabel(payload: FylloActionPayload): string {
  if ("title" in payload) {
    return payload.title;
  }
  if ("slug" in payload) {
    return payload.slug;
  }
  if ("name" in payload) {
    return payload.name;
  }
  return payload.summary;
}

function mountShell(
  parseResult: FylloActionParseResult,
  confirmHandler = vi.fn<() => Promise<FylloActionHandlerResult>>(),
  extraProps: Partial<InstanceType<typeof FylloActionShell>["$props"]> = {}
): VueWrapper {
  return mount(FylloActionShell, {
    props: {
      parseResult,
      definition: parseResult.status === "ready" ? taskCreateDefinition : null,
      confirmHandler,
      isDark: false,
      ...extraProps,
    },
    slots: {
      default: ({ payload }: { payload: FylloActionPayload }) =>
        h("div", { "data-test": "action-body" }, `typed body: ${payloadLabel(payload)}`),
    },
  });
}

function buttonByText(wrapper: VueWrapper, text: string): DOMWrapper<HTMLButtonElement> {
  const button = wrapper.findAll("button").find((node) => node.text() === text);
  if (!button) {
    throw new Error(`Missing button: ${text}`);
  }
  return button as DOMWrapper<HTMLButtonElement>;
}

function findButtonByText(
  wrapper: VueWrapper,
  text: string
): DOMWrapper<HTMLButtonElement> | undefined {
  return wrapper.findAll("button").find((node) => node.text() === text) as
    | DOMWrapper<HTMLButtonElement>
    | undefined;
}

describe("FylloActionShell", () => {
  it("renders fixed confirm and cancel labels with type-specific body content", () => {
    const wrapper = mountShell(readyResult());

    expect(wrapper.get('[data-test="action-body"]').text()).toContain("补齐错误处理");
    expect(buttonByText(wrapper, "确认").exists()).toBe(true);
    expect(buttonByText(wrapper, "取消").exists()).toBe(true);
  });

  it("renders knowledge.flag as an ordinary confirm action", () => {
    const wrapper = mountShell(
      {
        status: "ready",
        type: "knowledge.flag",
        payload: {
          summary: "markstream-vue theme subscriptions must stay outside leaf instances.",
          contextPaths: ["src/renderer/src/components/chat/MessageMarkdown.vue"],
        },
      },
      vi.fn(),
      {
        definition: knowledgeFlagDefinition,
      }
    );

    expect(wrapper.text()).toContain("发现可沉淀知识");
    expect(wrapper.text()).toContain("markstream-vue theme subscriptions");
    expect(buttonByText(wrapper, "沉淀知识").exists()).toBe(true);
    expect(buttonByText(wrapper, "取消").exists()).toBe(true);
  });

  it("exposes a data anchor only when an action id is provided", () => {
    const wrapperWithoutId = mountShell(readyResult());
    const wrapperWithId = mountShell(readyResult(), vi.fn(), {
      actionId: "chat:session-1:3:0:0",
    });

    expect(wrapperWithoutId.attributes("data-fyllo-action-id")).toBeUndefined();
    expect(wrapperWithId.attributes("data-fyllo-action-id")).toBe("chat:session-1:3:0:0");
  });

  it("disables confirm for invalid actions", () => {
    const wrapper = mountShell({
      status: "invalid",
      type: "task.create",
      error: {
        code: "invalid_payload",
        message: "invalid",
      },
    });

    expect((buttonByText(wrapper, "确认").element as HTMLButtonElement).disabled).toBe(true);
  });

  it("enters running and succeeded states and prevents duplicate confirm", async () => {
    let resolveHandler: (result: FylloActionHandlerResult) => void = () => {};
    const confirmHandler = vi.fn(
      () =>
        new Promise<FylloActionHandlerResult>((resolve) => {
          resolveHandler = resolve;
        })
    );
    const wrapper = mountShell(readyResult(), confirmHandler);

    await buttonByText(wrapper, "确认").trigger("click");

    expect(confirmHandler).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain("执行中");
    expect((buttonByText(wrapper, "确认").element as HTMLButtonElement).disabled).toBe(true);

    await buttonByText(wrapper, "确认").trigger("click");
    expect(confirmHandler).toHaveBeenCalledTimes(1);

    resolveHandler({ outcome: "succeeded" });
    await flushPromises();

    expect(wrapper.text()).toContain("已完成");
    expect(findButtonByText(wrapper, "确认")).toBeUndefined();
    expect(findButtonByText(wrapper, "取消")).toBeUndefined();
    expect(confirmHandler).toHaveBeenCalledTimes(1);
  });

  it("allows retry after a failed handler result", async () => {
    const confirmHandler = vi
      .fn<() => Promise<FylloActionHandlerResult>>()
      .mockResolvedValueOnce({ outcome: "failed", error: "创建失败" })
      .mockResolvedValueOnce({ outcome: "succeeded" });
    const wrapper = mountShell(readyResult(), confirmHandler);

    await buttonByText(wrapper, "确认").trigger("click");
    await flushPromises();

    expect(confirmHandler).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain("失败");
    expect(wrapper.text()).toContain("创建失败");
    expect((buttonByText(wrapper, "确认").element as HTMLButtonElement).disabled).toBe(false);

    await buttonByText(wrapper, "确认").trigger("click");
    await flushPromises();

    expect(confirmHandler).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).toContain("已完成");
    expect(findButtonByText(wrapper, "确认")).toBeUndefined();
    expect(findButtonByText(wrapper, "取消")).toBeUndefined();
  });

  it("cancels locally without calling the handler", async () => {
    const confirmHandler = vi.fn<() => Promise<FylloActionHandlerResult>>();
    const wrapper = mountShell(readyResult(), confirmHandler);

    await buttonByText(wrapper, "取消").trigger("click");

    expect(wrapper.text()).toContain("已取消");
    expect(confirmHandler).not.toHaveBeenCalled();
    expect(findButtonByText(wrapper, "确认")).toBeUndefined();
    expect(findButtonByText(wrapper, "取消")).toBeUndefined();
  });

  it("persists succeeded action state after a successful confirm", async () => {
    const persistActionState = vi.fn().mockResolvedValue(undefined);
    const confirmHandler = vi
      .fn<() => Promise<FylloActionHandlerResult>>()
      .mockResolvedValue({ outcome: "succeeded" });
    const wrapper = mountShell(readyResult(), confirmHandler, {
      actionId: "chat:session-1:0:0:0",
      persistActionState,
    });

    await buttonByText(wrapper, "确认").trigger("click");
    await flushPromises();

    expect(persistActionState).toHaveBeenCalledWith("chat:session-1:0:0:0", {
      type: "task.create",
      status: "succeeded",
      updatedAt: expect.any(String),
    });
  });

  it("persists additional completed action ids after a successful confirm", async () => {
    const persistActionState = vi.fn().mockResolvedValue(undefined);
    const confirmHandler = vi.fn<() => Promise<FylloActionHandlerResult>>().mockResolvedValue({
      outcome: "succeeded",
      completedActionIds: ["chat:session-1:0:0:0", "chat:session-1:0:0:1"],
    });
    const wrapper = mountShell(readyResult(), confirmHandler, {
      actionId: "chat:session-1:0:0:0",
      persistActionState,
    });

    await buttonByText(wrapper, "确认").trigger("click");
    await flushPromises();

    expect(persistActionState).toHaveBeenCalledTimes(2);
    expect(persistActionState).toHaveBeenNthCalledWith(1, "chat:session-1:0:0:0", {
      type: "task.create",
      status: "succeeded",
      updatedAt: expect.any(String),
    });
    expect(persistActionState).toHaveBeenNthCalledWith(2, "chat:session-1:0:0:1", {
      type: "task.create",
      status: "succeeded",
      updatedAt: expect.any(String),
    });
  });

  it("persists failed action state after a failed handler result", async () => {
    const persistActionState = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountShell(
      readyResult(),
      vi.fn<() => Promise<FylloActionHandlerResult>>().mockResolvedValue({
        outcome: "failed",
        error: "创建失败",
      }),
      {
        actionId: "chat:session-1:0:0:0",
        persistActionState,
      }
    );

    await buttonByText(wrapper, "确认").trigger("click");
    await flushPromises();

    expect(persistActionState).toHaveBeenCalledWith("chat:session-1:0:0:0", {
      type: "task.create",
      status: "failed",
      updatedAt: expect.any(String),
    });
  });

  it("persists cancelled action state for ready actions", async () => {
    const persistActionState = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountShell(readyResult(), vi.fn<() => Promise<FylloActionHandlerResult>>(), {
      actionId: "chat:session-1:0:0:0",
      persistActionState,
    });

    await buttonByText(wrapper, "取消").trigger("click");
    await flushPromises();

    expect(persistActionState).toHaveBeenCalledWith("chat:session-1:0:0:0", {
      type: "task.create",
      status: "cancelled",
      updatedAt: expect.any(String),
    });
  });

  it("rehydrates persisted succeeded state and disables confirm", () => {
    const wrapper = mountShell(readyResult(), vi.fn<() => Promise<FylloActionHandlerResult>>(), {
      persistedState: {
        type: "task.create",
        status: "succeeded",
        updatedAt: "2026-06-08T00:00:00.000Z",
      },
    });

    expect(wrapper.text()).toContain("已完成");
    expect(findButtonByText(wrapper, "确认")).toBeUndefined();
    expect(findButtonByText(wrapper, "取消")).toBeUndefined();
  });

  it("keeps succeeded UI when action state persistence fails", async () => {
    const wrapper = mountShell(
      readyResult(),
      vi.fn<() => Promise<FylloActionHandlerResult>>().mockResolvedValue({
        outcome: "succeeded",
      }),
      {
        actionId: "chat:session-1:0:0:0",
        persistActionState: vi.fn().mockRejectedValue(new Error("meta write failed")),
      }
    );

    await buttonByText(wrapper, "确认").trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("已完成");
    expect(wrapper.text()).toContain("状态保存失败");
    expect(wrapper.text()).toContain("meta write failed");
    expect(findButtonByText(wrapper, "确认")).toBeUndefined();
    expect(findButtonByText(wrapper, "取消")).toBeUndefined();
  });

  it("returns to ready without persisting when handler is dismissed", async () => {
    const persistActionState = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountShell(
      readyResult(),
      vi.fn<() => Promise<FylloActionHandlerResult>>().mockResolvedValue({
        outcome: "dismissed",
      }),
      {
        actionId: "chat:session-1:0:0:0",
        persistActionState,
      }
    );

    await buttonByText(wrapper, "确认").trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("待确认");
    expect(buttonByText(wrapper, "确认").exists()).toBe(true);
    expect(persistActionState).not.toHaveBeenCalled();
  });

  it("uses action definition labels and can hide cancel", () => {
    const wrapper = mountShell(readyResult(), vi.fn(), {
      definition: {
        ...taskCreateDefinition,
        confirmLabel: "审阅方案",
        showCancel: false,
      },
    });

    expect(buttonByText(wrapper, "审阅方案").exists()).toBe(true);
    expect(findButtonByText(wrapper, "取消")).toBeUndefined();
  });
});
