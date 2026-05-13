import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import TaskDetailModal from "@renderer/components/task/TaskDetailModal.vue";
import type { TaskItem } from "@shared/types/task";

function buildTask(overrides: Partial<TaskItem> = {}): TaskItem {
  return {
    id: "task-1",
    projectId: "project-1",
    title: "修复登录失败",
    description: "第一行\n第二行",
    status: "open",
    source: "local",
    sourceMeta: { source: "local" },
    labels: [{ id: "label-1", name: "P1" }],
    createdAt: new Date("2026-05-13T08:00:00.000Z"),
    updatedAt: new Date("2026-05-13T08:00:00.000Z"),
    ...overrides,
  };
}

describe("TaskDetailModal", () => {
  it("opens local tasks in view mode by default", () => {
    const wrapper = mount(TaskDetailModal, {
      props: {
        open: true,
        task: buildTask(),
      },
    });

    expect(wrapper.text()).toContain("任务详情");
    expect(wrapper.text()).toContain("编辑");
    expect(wrapper.find("input").exists()).toBe(false);
  });

  it("does not render edit button for external tasks", () => {
    const wrapper = mount(TaskDetailModal, {
      props: {
        open: true,
        task: buildTask({
          source: "github",
          sourceMeta: { source: "github", repository: "example/repo", number: 42 },
        }),
      },
    });

    expect(wrapper.text()).not.toContain("编辑");
  });

  it("prefills fields when entering edit mode", async () => {
    const wrapper = mount(TaskDetailModal, {
      props: {
        open: true,
        task: buildTask(),
      },
    });

    const editButton = wrapper.findAll("button").find((node) => node.text().includes("编辑"));
    await editButton?.trigger("click");

    const input = wrapper.get("input");
    const textarea = wrapper.get("textarea");

    expect((input.element as HTMLInputElement).value).toBe("修复登录失败");
    expect((textarea.element as HTMLTextAreaElement).value).toBe("第一行\n第二行");
  });

  it("disables save when title is blank", async () => {
    const wrapper = mount(TaskDetailModal, {
      props: {
        open: true,
        task: buildTask(),
      },
    });

    const editButton = wrapper.findAll("button").find((node) => node.text().includes("编辑"));
    await editButton?.trigger("click");
    await wrapper.get("input").setValue("   ");

    const saveButton = wrapper.findAll("button").find((node) => node.text().includes("保存"));
    expect(saveButton?.attributes("disabled")).toBeDefined();
  });

  it("discards edits when clicking cancel", async () => {
    const wrapper = mount(TaskDetailModal, {
      props: {
        open: true,
        task: buildTask(),
      },
    });

    const editButton = wrapper.findAll("button").find((node) => node.text().includes("编辑"));
    await editButton?.trigger("click");
    await wrapper.get("input").setValue("新的标题");

    const cancelButton = wrapper.findAll("button").find((node) => node.text().includes("取消"));
    await cancelButton?.trigger("click");

    expect(wrapper.find("input").exists()).toBe(false);
    expect(wrapper.text()).toContain("修复登录失败");
  });

  it("emits save with the expected payload", async () => {
    const wrapper = mount(TaskDetailModal, {
      props: {
        open: true,
        task: buildTask(),
      },
    });

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
            description: "更新后的描述",
          },
        },
      ],
    ]);
  });

  it("shows placeholder text when description is empty", () => {
    const wrapper = mount(TaskDetailModal, {
      props: {
        open: true,
        task: buildTask({ description: "" }),
      },
    });

    expect(wrapper.text()).toContain("暂无描述");
  });
});
