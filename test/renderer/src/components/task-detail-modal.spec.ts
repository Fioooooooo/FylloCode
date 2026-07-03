import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TaskDetailModal from "@renderer/components/task/TaskDetailModal.vue";
import type { TaskItem } from "@shared/types/task";

const confirmDialogMock = vi.fn<(options: Record<string, unknown>) => Promise<boolean>>();

vi.mock("@renderer/composables/useConfirmDialog", () => ({
  useConfirmDialog: () => confirmDialogMock,
}));

const editorStub = {
  template:
    '<div :data-content-type="contentType" :data-editable="String(editable)">{{ modelValue }}</div>',
  props: ["modelValue", "contentType", "editable"],
};

function buildTask(overrides: Partial<TaskItem> = {}): TaskItem {
  return {
    id: "task-1",
    projectId: "project-1",
    title: "修复登录失败",
    description: { format: "plain_text", content: "第一行\n第二行" },
    status: "open",
    source: "local",
    sourceMeta: { source: "local" },
    labels: [{ id: "label-1", name: "P1" }],
    createdAt: new Date("2026-05-13T08:00:00.000Z"),
    updatedAt: new Date("2026-05-13T08:00:00.000Z"),
    ...overrides,
  };
}

function mountModal(task: TaskItem, props?: Record<string, unknown>): ReturnType<typeof mount> {
  return mount(TaskDetailModal, {
    props: {
      open: true,
      task,
      ...props,
    },
    global: {
      stubs: {
        UEditor: editorStub,
      },
    },
  });
}

async function enterEditMode(wrapper: ReturnType<typeof mount>): Promise<void> {
  const editButton = wrapper.findAll("button").find((node) => node.text().includes("编辑"));
  await editButton?.trigger("click");
  await wrapper.vm.$nextTick();
}

describe("TaskDetailModal", () => {
  beforeEach(() => {
    confirmDialogMock.mockReset();
  });

  it("opens local tasks in view mode by default", () => {
    const wrapper = mountModal(buildTask());

    expect(wrapper.text()).toContain("任务详情");
    expect(wrapper.text()).toContain("编辑");
    expect(wrapper.find("input").exists()).toBe(false);
    expect(wrapper.find('[data-test="delete-task-button"]').exists()).toBe(false);
  });

  it("does not render edit button for external tasks", () => {
    const wrapper = mountModal(
      buildTask({
        source: "github",
        sourceMeta: { source: "github", repository: "example/repo", number: 42 },
      })
    );

    expect(wrapper.text()).not.toContain("编辑");
    expect(wrapper.find('[data-test="delete-task-button"]').exists()).toBe(false);
  });

  it("shows delete button in edit mode for local tasks", async () => {
    const wrapper = mountModal(buildTask());

    await enterEditMode(wrapper);

    const deleteButton = wrapper.find('[data-test="delete-task-button"]');
    expect(deleteButton.exists()).toBe(true);
    expect(deleteButton.text()).toContain("删除任务");
  });

  it("opens a confirm dialog before deleting and emits delete on confirm", async () => {
    const task = buildTask();
    confirmDialogMock.mockResolvedValue(true);

    const wrapper = mountModal(task);
    await enterEditMode(wrapper);

    await wrapper.get('[data-test="delete-task-button"]').trigger("click");

    expect(confirmDialogMock).toHaveBeenCalledWith({
      title: "删除任务？",
      description: "任务「修复登录失败」将被永久删除，且不可恢复。",
      confirmLabel: "删除任务",
      confirmColor: "error",
    });
    expect(wrapper.emitted("delete")).toEqual([[task]]);
  });

  it("does not emit delete when the confirm dialog is cancelled", async () => {
    confirmDialogMock.mockResolvedValue(false);

    const wrapper = mountModal(buildTask());
    await enterEditMode(wrapper);

    await wrapper.get('[data-test="delete-task-button"]').trigger("click");

    expect(wrapper.emitted("delete")).toBeUndefined();
  });

  it("prefills fields when entering edit mode", async () => {
    const wrapper = mountModal(buildTask());

    const editButton = wrapper.findAll("button").find((node) => node.text().includes("编辑"));
    await editButton?.trigger("click");

    const input = wrapper.get("input");
    const textarea = wrapper.get("textarea");

    expect((input.element as HTMLInputElement).value).toBe("修复登录失败");
    expect((textarea.element as HTMLTextAreaElement).value).toBe("第一行\n第二行");
  });

  it("disables save when title is blank", async () => {
    const wrapper = mountModal(buildTask());

    const editButton = wrapper.findAll("button").find((node) => node.text().includes("编辑"));
    await editButton?.trigger("click");
    await wrapper.get("input").setValue("   ");

    const saveButton = wrapper.findAll("button").find((node) => node.text().includes("保存"));
    expect(saveButton?.attributes("disabled")).toBeDefined();
  });

  it("discards edits when clicking cancel", async () => {
    const wrapper = mountModal(buildTask());

    const editButton = wrapper.findAll("button").find((node) => node.text().includes("编辑"));
    await editButton?.trigger("click");
    await wrapper.get("input").setValue("新的标题");

    const cancelButton = wrapper.findAll("button").find((node) => node.text().includes("取消"));
    await cancelButton?.trigger("click");

    expect(wrapper.find("input").exists()).toBe(false);
    expect(wrapper.text()).toContain("修复登录失败");
  });

  it("emits save with the expected payload", async () => {
    const wrapper = mountModal(buildTask());

    const editButton = wrapper.findAll("button").find((node) => node.text().includes("编辑"));
    await editButton?.trigger("click");
    await wrapper.get("input").setValue("修复登录失败 v2");
    await wrapper.get("textarea").setValue("更新后的描述");

    const saveButton = wrapper.findAll("button").find((node) => node.text().includes("保存"));
    await saveButton?.trigger("click");

    expect(wrapper.emitted("save")).toEqual([
      [
        {
          taskId: "task-1",
          updates: {
            title: "修复登录失败 v2",
            description: {
              format: "plain_text",
              content: "更新后的描述",
            },
            status: "open",
          },
        },
      ],
    ]);
  });

  it("shows placeholder text when description is empty", () => {
    const wrapper = mountModal(buildTask({ description: { format: "plain_text", content: "" } }));

    expect(wrapper.text()).toContain("暂无描述");
  });

  it("shows detail loading state in description area", () => {
    const wrapper = mountModal(
      buildTask({ source: "yunxiao", sourceMeta: { source: "yunxiao", key: "YX-1" } }),
      { detailLoading: true }
    );

    expect(wrapper.get('[data-test="detail-loading"]').text()).toContain("正在加载详情");
  });

  it("shows detail error state in description area", () => {
    const wrapper = mountModal(
      buildTask({ source: "yunxiao", sourceMeta: { source: "yunxiao", key: "YX-1" } }),
      { detailError: "load failed" }
    );

    expect(wrapper.get('[data-test="detail-error"]').text()).toContain("详情加载失败");
  });

  it("displays status badge in view mode", () => {
    const wrapper = mountModal(buildTask({ status: "open" }));

    expect(wrapper.text()).toContain("打开");
  });

  it("displays closed status badge for closed task", () => {
    const wrapper = mountModal(buildTask({ status: "closed" }));

    expect(wrapper.text()).toContain("关闭");
  });

  it("preselects status in edit mode", async () => {
    const wrapper = mountModal(buildTask({ status: "closed" }));

    const editButton = wrapper.findAll("button").find((node) => node.text().includes("编辑"));
    await editButton?.trigger("click");

    expect(wrapper.text()).toContain("编辑任务");
    expect(wrapper.text()).toContain("关闭");
  });

  it("maps plain text descriptions to markdown editor mode", () => {
    const wrapper = mountModal(
      buildTask({ description: { format: "plain_text", content: "纯文本" } })
    );

    expect((wrapper.vm as unknown as { editorContentType: string }).editorContentType).toBe(
      "markdown"
    );
  });

  it("maps markdown descriptions to markdown editor mode", () => {
    const wrapper = mountModal(
      buildTask({
        source: "yunxiao",
        sourceMeta: { source: "yunxiao", key: "YX-1", issueType: "任务" },
        description: { format: "markdown", content: "## 标题" },
      })
    );

    expect((wrapper.vm as unknown as { editorContentType: string }).editorContentType).toBe(
      "markdown"
    );
  });

  it("maps html descriptions to html editor mode", () => {
    const wrapper = mountModal(
      buildTask({
        source: "yunxiao",
        sourceMeta: { source: "yunxiao", key: "YX-1", issueType: "任务" },
        description: { format: "html", content: "<p>概述</p>" },
      })
    );

    expect((wrapper.vm as unknown as { editorContentType: string }).editorContentType).toBe("html");
  });
});
