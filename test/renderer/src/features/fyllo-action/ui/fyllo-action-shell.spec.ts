import { h } from "vue";
import { mount, type DOMWrapper, type VueWrapper } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import FylloActionShell from "@renderer/features/fyllo-action/ui/FylloActionShell.vue";
import {
  getRendererActionDefinition,
  rendererActionDefinitions,
} from "@renderer/features/fyllo-action/ui/renderer-registry";
import type { FylloActionParseResult, FylloActionPayload } from "@shared/fyllo-action/protocol";

const taskCreateDefinition = getRendererActionDefinition(rendererActionDefinitions, "task.create");
const knowledgeFlagDefinition = getRendererActionDefinition(
  rendererActionDefinitions,
  "knowledge.flag"
);

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
  extraProps: Partial<InstanceType<typeof FylloActionShell>["$props"]> = {}
): VueWrapper {
  return mount(FylloActionShell, {
    props: {
      parseResult,
      definition: parseResult.status === "ready" ? taskCreateDefinition : null,
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
    const wrapperWithId = mountShell(readyResult(), {
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

  it("emits confirm when the confirm button is clicked", async () => {
    const wrapper = mountShell(readyResult());

    await buttonByText(wrapper, "确认").trigger("click");

    expect(wrapper.emitted("confirm")).toHaveLength(1);
  });

  it("shows running state and disables confirm", () => {
    const wrapper = mountShell(readyResult(), { isRunning: true, executionStatus: "running" });

    expect(wrapper.text()).toContain("执行中");
    expect((buttonByText(wrapper, "确认").element as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows succeeded state and hides buttons", () => {
    const wrapper = mountShell(readyResult(), { executionStatus: "succeeded" });

    expect(wrapper.text()).toContain("已完成");
    expect(findButtonByText(wrapper, "确认")).toBeUndefined();
    expect(findButtonByText(wrapper, "取消")).toBeUndefined();
  });

  it("shows failed state and execution error", () => {
    const wrapper = mountShell(readyResult(), {
      executionStatus: "failed",
      executionError: "创建失败",
    });

    expect(wrapper.text()).toContain("失败");
    expect(wrapper.text()).toContain("创建失败");
  });

  it("emits cancel when the cancel button is clicked", async () => {
    const wrapper = mountShell(readyResult());

    await buttonByText(wrapper, "取消").trigger("click");

    expect(wrapper.emitted("cancel")).toHaveLength(1);
  });

  it("shows cancelled state and hides buttons", () => {
    const wrapper = mountShell(readyResult(), { executionStatus: "cancelled" });

    expect(wrapper.text()).toContain("已取消");
    expect(findButtonByText(wrapper, "确认")).toBeUndefined();
    expect(findButtonByText(wrapper, "取消")).toBeUndefined();
  });

  it("rehydrates persisted succeeded state and disables confirm", () => {
    const wrapper = mountShell(readyResult(), {
      persistedState: {
        type: "task.create",
        status: "succeeded",
        revision: 1,
        updatedAt: "2026-06-08T00:00:00.000Z",
      },
    });

    expect(wrapper.text()).toContain("已完成");
    expect(findButtonByText(wrapper, "确认")).toBeUndefined();
    expect(findButtonByText(wrapper, "取消")).toBeUndefined();
  });

  it("shows persisted error", () => {
    const wrapper = mountShell(readyResult(), {
      persistedState: {
        type: "task.create",
        status: "failed",
        revision: 2,
        updatedAt: "2026-06-08T00:00:00.000Z",
        error: "meta write failed",
      },
    });

    expect(wrapper.text()).toContain("持久化错误");
    expect(wrapper.text()).toContain("meta write failed");
  });

  it("shows state sync error with retry button", async () => {
    const wrapper = mountShell(readyResult(), {
      stateSyncError: "sync failed",
    });

    expect(wrapper.text()).toContain("状态保存失败");
    expect(wrapper.text()).toContain("sync failed");

    const retryButton = wrapper.findAll("button").find((node) => node.text().includes("重试"));
    await retryButton?.trigger("click");

    expect(wrapper.emitted("retrySync")).toHaveLength(1);
  });

  it("uses action definition labels and can hide cancel", () => {
    const wrapper = mountShell(readyResult(), {
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
