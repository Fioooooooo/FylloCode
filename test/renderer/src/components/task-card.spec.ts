import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TaskCard, { type LinkedSessionEntry } from "@renderer/components/task/TaskCard.vue";
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

function buildLinkedSession(overrides: Partial<LinkedSessionEntry> = {}): LinkedSessionEntry {
  return {
    sessionId: "session-1",
    title: "关联会话 1",
    updatedAt: new Date("2026-05-13T10:00:00.000Z"),
    status: "ended",
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

  it("does not emit view-detail when clicking close", async () => {
    confirmDialogMock.mockResolvedValue(false);

    const wrapper = mount(TaskCard, {
      props: {
        task: buildTask(),
      },
    });

    await wrapper.get('button[title="关闭任务"]').trigger("click");

    expect(wrapper.emitted("view-detail")).toBeUndefined();
  });

  it("shows close button for open local tasks and no delete button", () => {
    const wrapper = mount(TaskCard, {
      props: {
        task: buildTask(),
      },
    });

    expect(wrapper.find('button[title="关闭任务"]').exists()).toBe(true);
    expect(wrapper.find('button[title="删除任务"]').exists()).toBe(false);
  });

  it("opens a confirm dialog before closing and emits close on confirm", async () => {
    const task = buildTask();
    confirmDialogMock.mockResolvedValue(true);

    const wrapper = mount(TaskCard, {
      props: {
        task,
      },
    });

    await wrapper.get('button[title="关闭任务"]').trigger("click");

    expect(confirmDialogMock).toHaveBeenCalledWith({
      title: "关闭任务？",
      description: "任务「修复登录失败」会移到“关闭”列表，可在关闭 tab 中重新打开。",
      confirmLabel: "关闭任务",
      confirmColor: "neutral",
    });
    expect(wrapper.emitted("close")).toEqual([[task]]);
  });

  it("does not emit close when the confirm dialog is cancelled", async () => {
    confirmDialogMock.mockResolvedValue(false);

    const wrapper = mount(TaskCard, {
      props: {
        task: buildTask(),
      },
    });

    await wrapper.get('button[title="关闭任务"]').trigger("click");

    expect(wrapper.emitted("close")).toBeUndefined();
  });

  it("hides close and delete buttons for closed local tasks", () => {
    const wrapper = mount(TaskCard, {
      props: {
        task: buildTask({ status: "closed" }),
      },
    });

    expect(wrapper.find('button[title="关闭任务"]').exists()).toBe(false);
    expect(wrapper.find('button[title="删除任务"]').exists()).toBe(false);
  });

  it("hides close and delete buttons for non-local tasks", () => {
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

    expect(wrapper.find('button[title="关闭任务"]').exists()).toBe(false);
    expect(wrapper.find('button[title="删除任务"]').exists()).toBe(false);
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

  it("shows the linked conversation count when linked sessions exist", async () => {
    const wrapper = mount(TaskCard, {
      props: {
        task: buildTask(),
        linkedSessions: [buildLinkedSession(), buildLinkedSession({ sessionId: "session-2" })],
      },
    });

    expect(wrapper.text()).toContain("2 个对话");
    expect(wrapper.find('[data-test="linked-session-trigger"]').exists()).toBe(true);
  });

  it("hides the linked conversation trigger when there are no linked sessions", () => {
    const wrapper = mount(TaskCard, {
      props: {
        task: buildTask(),
      },
    });

    expect(wrapper.text()).not.toContain("个对话");
    expect(wrapper.find('[data-test="linked-session-trigger"]').exists()).toBe(false);
  });

  it("renders linked session items in the popover and emits open-session on click", async () => {
    const sessions = [
      buildLinkedSession(),
      buildLinkedSession({ sessionId: "session-2", title: "关联会话 2" }),
    ];
    const wrapper = mount(TaskCard, {
      props: {
        task: buildTask(),
        linkedSessions: sessions,
      },
    });

    const vm = wrapper.vm as unknown as { linkedConversationsOpen: boolean };
    vm.linkedConversationsOpen = true;
    await wrapper.vm.$nextTick();

    const list = wrapper.find('[data-test="linked-session-list"]');
    expect(list.exists()).toBe(true);
    expect(list.find('[data-test="linked-session-item-session-1"]').text()).toContain("关联会话 1");
    expect(list.find('[data-test="linked-session-item-session-2"]').text()).toContain("关联会话 2");

    await list.get('[data-test="linked-session-item-session-2"]').trigger("click");

    expect(wrapper.emitted("open-session")).toEqual([["session-2"]]);
  });

  it("falls back to sessionId when the linked session title is empty", async () => {
    const wrapper = mount(TaskCard, {
      props: {
        task: buildTask(),
        linkedSessions: [buildLinkedSession({ title: "", sessionId: "orphan-session" })],
      },
    });

    const vm = wrapper.vm as unknown as { linkedConversationsOpen: boolean };
    vm.linkedConversationsOpen = true;
    await wrapper.vm.$nextTick();

    const item = wrapper.find('[data-test="linked-session-item-orphan-session"]');
    expect(item.text()).toContain("orphan-session");
  });
});
