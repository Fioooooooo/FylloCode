import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TaskCard from "@renderer/components/task/TaskCard.vue";
import type { TaskItem } from "@shared/types/task";

const confirmDialogMock = vi.fn<(options: Record<string, unknown>) => Promise<boolean>>();

vi.mock("@renderer/composables/useConfirmDialog", () => ({
  useConfirmDialog: () => confirmDialogMock,
}));

function buildTask(overrides: Partial<TaskItem> = {}): TaskItem {
  return {
    id: "task-1",
    projectId: "project-1",
    title: "修复登录失败",
    description: { format: "plain_text", content: "排查 token 过期逻辑" },
    status: "open",
    source: "local",
    sourceMeta: { source: "local" },
    labels: [{ id: "label-1", name: "P1" }],
    createdAt: new Date("2026-05-13T08:00:00.000Z"),
    updatedAt: new Date("2026-05-13T08:00:00.000Z"),
    ...overrides,
  };
}

describe("TaskCard", () => {
  beforeEach(() => {
    confirmDialogMock.mockReset();
  });

  it("emits view-detail when clicking the main content area", async () => {
    const wrapper = mount(TaskCard, {
      props: {
        task: buildTask(),
      },
    });

    await wrapper.get('[data-role="detail-trigger"]').trigger("click");

    expect(wrapper.emitted("view-detail")).toEqual([[buildTask()]]);
  });

  it("does not emit view-detail when clicking start discussion", async () => {
    const task = buildTask();
    const wrapper = mount(TaskCard, {
      props: {
        task,
      },
    });

    const button = wrapper.findAll("button").find((node) => node.text().includes("发起讨论"));

    await button?.trigger("click");

    expect(wrapper.emitted("start-discussion")).toEqual([[task]]);
    expect(wrapper.emitted("view-detail")).toBeUndefined();
  });

  it("does not emit view-detail when clicking delete", async () => {
    confirmDialogMock.mockResolvedValue(false);

    const wrapper = mount(TaskCard, {
      props: {
        task: buildTask(),
      },
    });

    await wrapper.get('button[title="删除任务"]').trigger("click");

    expect(wrapper.emitted("view-detail")).toBeUndefined();
  });

  it("opens a confirm dialog before deleting and emits delete on confirm", async () => {
    const task = buildTask();
    confirmDialogMock.mockResolvedValue(true);

    const wrapper = mount(TaskCard, {
      props: {
        task,
      },
    });

    await wrapper.get('button[title="删除任务"]').trigger("click");

    expect(confirmDialogMock).toHaveBeenCalledWith({
      title: "删除任务",
      description: "确认删除这条本地任务吗？删除后无法恢复。",
      confirmLabel: "删除",
      confirmColor: "error",
    });
    expect(wrapper.emitted("delete")).toEqual([[task]]);
  });

  it("does not emit delete when the confirm dialog is cancelled", async () => {
    confirmDialogMock.mockResolvedValue(false);

    const wrapper = mount(TaskCard, {
      props: {
        task: buildTask(),
      },
    });

    await wrapper.get('button[title="删除任务"]').trigger("click");

    expect(wrapper.emitted("delete")).toBeUndefined();
  });

  it("shows source button for yunxiao tasks when sourceMeta.url exists", () => {
    const wrapper = mount(TaskCard, {
      props: {
        task: buildTask({
          source: "yunxiao",
          sourceMeta: {
            source: "yunxiao",
            url: "https://devops.aliyun.com/projex/project/space-1/task/102",
            key: "YX-102",
            issueType: "任务",
          },
        }),
      },
    });

    expect(wrapper.text()).toContain("任务来源");
  });

  it("renders html descriptions as plain text summary", () => {
    const wrapper = mount(TaskCard, {
      props: {
        task: buildTask({
          source: "yunxiao",
          description: {
            format: "html",
            content: "<p>富文本描述</p>",
          },
          sourceMeta: {
            source: "yunxiao",
            url: "https://devops.aliyun.com/projex/project/space-1/task/102",
            key: "YX-102",
            issueType: "任务",
          },
        }),
      },
    });

    expect(wrapper.text()).toContain("富文本描述");
    expect(wrapper.text()).not.toContain("<p>");
  });
});
