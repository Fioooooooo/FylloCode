import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { reactive } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TaskPage from "@renderer/pages/task.vue";
import { buildSourceDisplay, getTaskDescriptionPlainText } from "@renderer/utils/task";
import type { Session } from "@shared/types/chat";
import type { TaskItem, TaskStatus } from "@shared/types/task";

const { ensureTaskSubjectMock } = vi.hoisted(() => ({
  ensureTaskSubjectMock: vi.fn(),
}));
const { getByTaskMock } = vi.hoisted(() => ({
  getByTaskMock: vi.fn(),
}));
const { openChatSessionMock } = vi.hoisted(() => ({
  openChatSessionMock: vi.fn<(sessionId: string) => Promise<void>>(),
}));

const sessions = reactive<Session[]>([]);

type VisibleTaskSource = "local" | "yunxiao";

type TaskStoreStub = {
  tasks: TaskItem[];
  loading: boolean;
  error: string | null;
  detailLoadingTaskId: string | null;
  detailErrorTaskId: string | null;
  detailErrorMessage: string | null;
  availableSources: VisibleTaskSource[];
  sourceTabs: Array<{ label: string; value: VisibleTaskSource }>;
  projectIntegration: unknown;
  sourceFilter: VisibleTaskSource | "all";
  statusFilter: TaskStatus;
  tasksBySource: TaskItem[];
  filteredTasks: TaskItem[];
  refreshAvailableSources: ReturnType<typeof vi.fn>;
  loadTasks: typeof loadTasksMock;
  loadTaskDetail: typeof loadTaskDetailMock;
  createTask: typeof createTaskMock;
  updateTask: typeof updateTaskMock;
  deleteTask: typeof deleteTaskMock;
  buildTaskRef: typeof buildTaskRefStub;
  ensureTaskSubject: typeof ensureTaskSubjectMock;
  getTaskLineage: typeof getByTaskMock;
  startDiscussionFromTask: typeof startDiscussionFromTaskMock;
  getLinkedSessionEntries: (links: Array<{ sessionId: string; createdAt: string }>) => Array<{
    sessionId: string;
    title: string;
    updatedAt?: Date;
    createdAt?: Date;
    status?: "running" | "ended";
  }>;
  resetDetailState: ReturnType<typeof vi.fn>;
};

const loadTasksMock = vi.fn();
const loadTaskDetailMock = vi.fn();
const createTaskMock = vi.fn();
const updateTaskMock = vi.fn();
const deleteTaskMock = vi.fn();
const startDiscussionFromTaskMock = vi.fn(startDiscussionFromTaskStub);
const sendMessageMock = vi.fn();
const pushMock = vi.fn();
const beginDraftSessionMock = vi.fn();
const toastAddMock = vi.fn();

function buildTaskRefStub(task: TaskItem): `${TaskItem["source"]}:${string}` {
  return `${task.source}:${task.id}`;
}

function buildTaskPromptStub(task: TaskItem): string {
  const sourceDisplay = buildSourceDisplay(task);
  const descriptionText = getTaskDescriptionPlainText(task.description);
  const url =
    task.source !== "local" && "url" in task.sourceMeta && task.sourceMeta.url
      ? ` (${task.sourceMeta.url})`
      : "";
  const sections = [`**来源**: ${sourceDisplay}${url}`, `**标题**: ${task.title}`];

  if (descriptionText) {
    sections.push("", "**描述**:", descriptionText);
  }

  sections.push("", "请帮我规划这个任务的方案");
  return sections.join("\n");
}

async function startDiscussionFromTaskStub(task: TaskItem): Promise<void> {
  const projectId = projectStore.currentProject?.id;
  if (!projectId) {
    return;
  }

  const taskRef = buildTaskRefStub(task);
  const result = await ensureTaskSubjectMock(projectId, {
    ref: taskRef,
    snapshot: JSON.parse(JSON.stringify(task)) as TaskItem,
    capturedAt: new Date().toISOString(),
  });
  if (!result.ok) {
    throw new Error(result.error.message || result.error.code);
  }

  beginDraftSessionMock();
  await sendMessageMock([{ type: "text", text: buildTaskPromptStub(task) }], { taskRef });
}

const taskStore = reactive<TaskStoreStub>({
  tasks: [] as TaskItem[],
  loading: false,
  error: null as string | null,
  detailLoadingTaskId: null,
  detailErrorTaskId: null,
  detailErrorMessage: null,
  availableSources: ["local"],
  sourceTabs: [{ label: "本地", value: "local" as const }],
  projectIntegration: null,
  sourceFilter: "local",
  statusFilter: "open",
  tasksBySource: [] as TaskItem[],
  filteredTasks: [] as TaskItem[],
  refreshAvailableSources: vi.fn(),
  loadTasks: loadTasksMock,
  loadTaskDetail: loadTaskDetailMock,
  createTask: createTaskMock,
  updateTask: updateTaskMock,
  deleteTask: deleteTaskMock,
  buildTaskRef: buildTaskRefStub,
  ensureTaskSubject: ensureTaskSubjectMock,
  getTaskLineage: getByTaskMock,
  startDiscussionFromTask: startDiscussionFromTaskMock,
  getLinkedSessionEntries: (links) =>
    links.map((link) => {
      const session = sessions.find((item) => item.id === link.sessionId);
      if (session) {
        return {
          sessionId: link.sessionId,
          title: session.title,
          updatedAt: session.updatedAt,
          status: session.status,
        };
      }

      return {
        sessionId: link.sessionId,
        title: link.sessionId,
        createdAt: new Date(link.createdAt),
      };
    }),
  resetDetailState: vi.fn(),
});

const projectStore = reactive({
  currentProject: { id: "project-1" } as { id: string } | null,
});

vi.mock("@renderer/stores/automation/task", () => ({
  useTaskStore: () => taskStore,
}));

vi.mock("@renderer/stores/workspace/project", () => ({
  useProjectStore: () => projectStore,
}));

vi.mock("@renderer/stores/session/chat", () => ({
  useChatStore: () => ({
    sendMessage: sendMessageMock,
  }),
}));

vi.mock("@renderer/stores/session/session", () => ({
  useSessionStore: () => ({
    sessions,
    beginDraftSession: beginDraftSessionMock,
  }),
}));

vi.mock("@renderer/composables/useOpenChatSession", () => ({
  useOpenChatSession: () => ({
    openChatSession: openChatSessionMock,
  }),
}));

vi.mock("vue-router", () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));

vi.mock("@nuxt/ui/composables", async () => {
  const actual = await vi.importActual<object>("@nuxt/ui/composables");
  return {
    ...actual,
    useToast: vi.fn(() => ({ add: toastAddMock })),
  };
});

const taskCardStub = {
  props: ["task", "linkedSessions"],
  emits: ["start-discussion", "open-session", "view-detail", "close"],
  template:
    '<div data-test="task-card">{{ task.title }}<button type="button" data-test="start-discussion" @click="$emit(\'start-discussion\', task)">讨论</button><button v-if="(linkedSessions ?? []).length > 0" type="button" data-test="linked-session-trigger" @click="$emit(\'open-session\', linkedSessions[0].sessionId)">{{ linkedSessions.length }} 个对话</button><button type="button" data-test="view-detail" @click="$emit(\'view-detail\', task)" /><button type="button" data-test="close-task" @click="$emit(\'close\', task)" /></div>',
};

const createTaskModalStub = {
  props: ["open"],
  emits: ["update:open", "create"],
  template: "<div />",
};

const taskDetailModalStub = {
  props: ["open", "task", "error", "detailLoading", "detailError"],
  emits: ["update:open", "save", "delete"],
  template:
    '<div><div data-test="detail-modal">{{ task?.title }}|{{ detailLoading ? "loading" : "idle" }}|{{ detailError || "" }}</div><button type="button" data-test="delete-task" @click="$emit(\'delete\', task)" /></div>',
};

describe("task page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureTaskSubjectMock.mockResolvedValue({
      ok: true,
      data: {
        id: "subject-1",
        origin: "task",
        task: null,
        links: [],
        createdAt: "2026-06-09T00:00:00.000Z",
        updatedAt: "2026-06-09T00:00:00.000Z",
      },
    });
    getByTaskMock.mockResolvedValue({ ok: true, data: { links: [] } });
    openChatSessionMock.mockResolvedValue(undefined);
    sendMessageMock.mockResolvedValue(undefined);
    pushMock.mockResolvedValue(undefined);
    projectStore.currentProject = { id: "project-1" };
    taskStore.loading = false;
    taskStore.error = null;
    taskStore.availableSources = ["local"];
    taskStore.sourceTabs = [{ label: "本地", value: "local" }];
    taskStore.sourceFilter = "local";
    taskStore.statusFilter = "open";
    taskStore.detailLoadingTaskId = null;
    taskStore.detailErrorTaskId = null;
    taskStore.detailErrorMessage = null;
    taskStore.tasks = [];
    taskStore.tasksBySource = [];
    taskStore.filteredTasks = [];
    sessions.length = 0;
  });

  function mountPage(): VueWrapper {
    return mount(TaskPage, {
      global: {
        stubs: {
          TaskCard: taskCardStub,
          CreateTaskModal: createTaskModalStub,
          TaskDetailModal: taskDetailModalStub,
        },
      },
    });
  }

  it("shows the updated description copy", async () => {
    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.text()).toContain("集中查看任务，并快速发起 AI 讨论。");
  });

  it("shows yunxiao tab only when mounted resources exist", async () => {
    taskStore.availableSources = ["local", "yunxiao"];
    taskStore.sourceTabs = [
      { label: "本地", value: "local" },
      { label: "云效", value: "yunxiao" },
    ];

    const wrapper = mountPage();
    await flushPromises();
    expect(wrapper.text()).toContain("云效");

    taskStore.availableSources = ["local"];
    taskStore.sourceTabs = [{ label: "本地", value: "local" }];

    const wrapperWithoutYunxiao = mountPage();
    await flushPromises();
    expect(wrapperWithoutYunxiao.text()).not.toContain("云效");
  });

  it("reuses the empty state when yunxiao has no tasks", async () => {
    taskStore.availableSources = ["local", "yunxiao"];
    taskStore.sourceTabs = [
      { label: "本地", value: "local" },
      { label: "云效", value: "yunxiao" },
    ];
    taskStore.sourceFilter = "yunxiao";
    loadTasksMock.mockImplementation(async (source?: string) => {
      taskStore.sourceFilter = (source as "local" | "yunxiao") ?? "all";
      taskStore.filteredTasks = [];
    });

    const wrapper = mountPage();
    await flushPromises();
    await wrapper.get('[data-test="tab-yunxiao"]').trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("暂无任务");
  });

  it("hides local controls when viewing yunxiao tasks", async () => {
    taskStore.availableSources = ["local", "yunxiao"];
    taskStore.sourceTabs = [
      { label: "本地", value: "local" },
      { label: "云效", value: "yunxiao" },
    ];
    taskStore.sourceFilter = "yunxiao";
    taskStore.filteredTasks = [
      {
        id: "yx-1",
        projectId: "project-1",
        title: "云效任务",
        description: { format: "plain_text", content: "" },
        status: "open",
        source: "yunxiao",
        sourceMeta: {
          source: "yunxiao",
          url: "https://devops.aliyun.com/projex/project/space-1/task/1",
          key: "YX-1",
          issueType: "任务",
        },
        labels: [],
        createdAt: new Date("2026-05-10T08:00:00.000Z"),
        updatedAt: new Date("2026-05-10T08:00:00.000Z"),
      },
    ];
    loadTasksMock.mockImplementation(async (source?: string) => {
      taskStore.sourceFilter = (source as "local" | "yunxiao") ?? "all";
    });

    const wrapper = mountPage();
    await flushPromises();
    await wrapper.get('[data-test="tab-yunxiao"]').trigger("click");
    await flushPromises();

    expect(wrapper.text()).not.toContain("新建任务");
    expect(wrapper.text()).not.toContain("打开");
    expect(wrapper.text()).toContain("云效任务");
  });

  it("builds prompt with source url for yunxiao tasks", async () => {
    taskStore.filteredTasks = [
      {
        id: "yunxiao:space-1:102",
        projectId: "project-1",
        title: "云效任务",
        description: {
          format: "html",
          content: "<table><tr><td>需求详细说明</td></tr></table>",
        },
        status: "open",
        source: "yunxiao",
        sourceMeta: {
          source: "yunxiao",
          url: "https://devops.aliyun.com/projex/project/space-1/task/102",
          key: "YX-102",
          issueType: "任务",
        },
        labels: [],
        createdAt: new Date("2026-05-10T08:00:00.000Z"),
        updatedAt: new Date("2026-05-10T08:00:00.000Z"),
      },
    ];

    const wrapper = mountPage();
    await flushPromises();
    await wrapper.get('[data-test="start-discussion"]').trigger("click");
    await flushPromises();

    const serializedTask = JSON.parse(JSON.stringify(taskStore.filteredTasks[0])) as unknown;
    const promptText = sendMessageMock.mock.calls[0]?.[0]?.[0]?.text as string;
    expect(ensureTaskSubjectMock).toHaveBeenCalledWith(
      "project-1",
      expect.objectContaining({
        ref: "yunxiao:yunxiao:space-1:102",
        snapshot: serializedTask,
        capturedAt: expect.any(String),
      })
    );
    expect(beginDraftSessionMock).toHaveBeenCalledTimes(1);
    expect(promptText).toContain(
      "**来源**: 云效 YX-102 (https://devops.aliyun.com/projex/project/space-1/task/102)\n**标题**: 云效任务"
    );
    expect(promptText).toContain("需求详细说明");
    expect(promptText).not.toContain("<table>");
    expect(promptText).not.toContain("()");
    expect(sendMessageMock.mock.calls[0]?.[1]).toEqual({
      taskRef: "yunxiao:yunxiao:space-1:102",
    });
    expect(pushMock).toHaveBeenCalledWith("/chat");
  });

  it("does not start chat when ensureTaskSubject fails", async () => {
    const task = {
      id: "task-1",
      projectId: "project-1",
      title: "本地任务",
      description: { format: "plain_text", content: "详情" },
      status: "open",
      source: "local",
      sourceMeta: { source: "local" },
      labels: [],
      createdAt: new Date("2026-05-10T08:00:00.000Z"),
      updatedAt: new Date("2026-05-10T08:00:00.000Z"),
    } satisfies TaskItem;
    taskStore.filteredTasks = [task];
    ensureTaskSubjectMock.mockResolvedValueOnce({
      ok: false,
      error: { code: "UNKNOWN_ERROR", message: "lineage failed" },
    });

    const wrapper = mountPage();
    await flushPromises();
    await wrapper.get('[data-test="start-discussion"]').trigger("click");
    await flushPromises();

    const serializedTask = JSON.parse(JSON.stringify(task)) as unknown;
    expect(ensureTaskSubjectMock).toHaveBeenCalledWith(
      "project-1",
      expect.objectContaining({
        ref: "local:task-1",
        snapshot: serializedTask,
        capturedAt: expect.any(String),
      })
    );
    expect(beginDraftSessionMock).not.toHaveBeenCalled();
    expect(sendMessageMock).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
    expect(toastAddMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "发起讨论失败",
        color: "error",
      })
    );
  });

  it("loads yunxiao task detail after opening the modal", async () => {
    const detailTask = {
      id: "yunxiao:space-1:102",
      projectId: "project-1",
      title: "云效任务详情",
      description: {
        format: "markdown",
        content: "详情描述",
      },
      status: "open",
      source: "yunxiao",
      sourceMeta: {
        source: "yunxiao",
        key: "YX-102",
        issueType: "任务",
      },
      labels: [],
      createdAt: new Date("2026-05-10T08:00:00.000Z"),
      updatedAt: new Date("2026-05-10T09:00:00.000Z"),
    } satisfies TaskItem;
    taskStore.filteredTasks = [
      {
        ...detailTask,
        title: "云效任务",
        description: { format: "plain_text", content: "" },
      },
    ];
    loadTaskDetailMock.mockResolvedValue(detailTask);

    const taskCardViewDetailStub = {
      props: ["task", "linkedSessions"],
      template:
        '<button type="button" data-test="view-detail" @click="$emit(\'view-detail\', task)">{{ task.title }}</button>',
    };

    const wrapper = mount(TaskPage, {
      global: {
        stubs: {
          TaskCard: taskCardViewDetailStub,
          CreateTaskModal: createTaskModalStub,
          TaskDetailModal: taskDetailModalStub,
        },
      },
    });

    await flushPromises();
    await wrapper.get('[data-test="view-detail"]').trigger("click");
    await flushPromises();

    expect(loadTaskDetailMock).toHaveBeenCalledWith("yunxiao:space-1:102");
    expect(wrapper.get('[data-test="detail-modal"]').text()).toContain("云效任务详情");
  });

  it("keeps modal open when yunxiao detail loading fails", async () => {
    taskStore.filteredTasks = [
      {
        id: "yunxiao:space-1:103",
        projectId: "project-1",
        title: "云效任务",
        description: { format: "plain_text", content: "" },
        status: "open",
        source: "yunxiao",
        sourceMeta: {
          source: "yunxiao",
          key: "YX-103",
          issueType: "任务",
        },
        labels: [],
        createdAt: new Date("2026-05-10T08:00:00.000Z"),
        updatedAt: new Date("2026-05-10T08:00:00.000Z"),
      },
    ];
    loadTaskDetailMock.mockRejectedValue(new Error("boom"));
    taskStore.detailErrorTaskId = "yunxiao:space-1:103";
    taskStore.detailErrorMessage = "详情加载失败";

    const taskCardViewDetailStub = {
      props: ["task", "linkedSessions"],
      template:
        '<button type="button" data-test="view-detail" @click="$emit(\'view-detail\', task)">{{ task.title }}</button>',
    };

    const wrapper = mount(TaskPage, {
      global: {
        stubs: {
          TaskCard: taskCardViewDetailStub,
          CreateTaskModal: createTaskModalStub,
          TaskDetailModal: taskDetailModalStub,
        },
      },
    });

    await flushPromises();
    await wrapper.get('[data-test="view-detail"]').trigger("click");
    await flushPromises();

    expect(wrapper.get('[data-test="detail-modal"]').text()).toContain("云效任务");
    expect(wrapper.text()).not.toContain("boom");
  });

  it("shows linked conversation trigger when a task has linked sessions", async () => {
    const task = {
      id: "task-linked",
      projectId: "project-1",
      title: "已关联任务",
      description: { format: "plain_text", content: "" },
      status: "open",
      source: "local",
      sourceMeta: { source: "local" },
      labels: [],
      createdAt: new Date("2026-05-10T08:00:00.000Z"),
      updatedAt: new Date("2026-05-10T08:00:00.000Z"),
    } satisfies TaskItem;
    taskStore.filteredTasks = [task];
    getByTaskMock.mockResolvedValueOnce({
      ok: true,
      data: {
        subjectId: "subject-linked",
        origin: "task" as const,
        task: null,
        links: [
          {
            sessionId: "session-1",
            createdAt: "2026-06-09T00:00:00.000Z",
            proposals: [],
            plans: [],
          },
        ],
      },
    });

    const wrapper = mountPage();
    await flushPromises();

    expect(getByTaskMock).toHaveBeenCalledWith("project-1", "local:task-linked");
    expect(wrapper.text()).toContain("1 个对话");
    expect(wrapper.find('[data-test="linked-session-trigger"]').exists()).toBe(true);
  });

  it("hides linked conversation trigger when a task has no linked sessions", async () => {
    const task = {
      id: "task-no-link",
      projectId: "project-1",
      title: "无关联任务",
      description: { format: "plain_text", content: "" },
      status: "open",
      source: "local",
      sourceMeta: { source: "local" },
      labels: [],
      createdAt: new Date("2026-05-10T08:00:00.000Z"),
      updatedAt: new Date("2026-05-10T08:00:00.000Z"),
    } satisfies TaskItem;
    taskStore.filteredTasks = [task];
    getByTaskMock.mockResolvedValueOnce({ ok: true, data: { links: [] } });

    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.text()).not.toContain("个对话");
    expect(wrapper.find('[data-test="linked-session-trigger"]').exists()).toBe(false);
  });

  it("does not block the task list when linked conversation query fails", async () => {
    const task = {
      id: "task-fail-link",
      projectId: "project-1",
      title: "关联查询失败任务",
      description: { format: "plain_text", content: "" },
      status: "open",
      source: "local",
      sourceMeta: { source: "local" },
      labels: [],
      createdAt: new Date("2026-05-10T08:00:00.000Z"),
      updatedAt: new Date("2026-05-10T08:00:00.000Z"),
    } satisfies TaskItem;
    taskStore.filteredTasks = [task];
    getByTaskMock.mockRejectedValueOnce(new Error("network error"));

    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.text()).toContain("关联查询失败任务");
    expect(taskStore.error).toBeNull();
    expect(wrapper.find('[data-test="linked-session-trigger"]').exists()).toBe(false);
  });

  it("opens the linked session when the trigger is clicked", async () => {
    const task = {
      id: "task-open-session",
      projectId: "project-1",
      title: "打开关联会话",
      description: { format: "plain_text", content: "" },
      status: "open",
      source: "local",
      sourceMeta: { source: "local" },
      labels: [],
      createdAt: new Date("2026-05-10T08:00:00.000Z"),
      updatedAt: new Date("2026-05-10T08:00:00.000Z"),
    } satisfies TaskItem;
    taskStore.filteredTasks = [task];
    getByTaskMock.mockResolvedValueOnce({
      ok: true,
      data: {
        subjectId: "subject-open",
        origin: "task" as const,
        task: null,
        links: [
          {
            sessionId: "session-target",
            createdAt: "2026-06-09T00:00:00.000Z",
            proposals: [],
            plans: [],
          },
        ],
      },
    });

    const wrapper = mountPage();
    await flushPromises();

    await wrapper.get('[data-test="linked-session-trigger"]').trigger("click");
    await flushPromises();

    expect(openChatSessionMock).toHaveBeenCalledWith("session-target");
  });

  it("closes a local task when TaskCard emits close", async () => {
    const task = {
      id: "task-close",
      projectId: "project-1",
      title: "待关闭任务",
      description: { format: "plain_text", content: "" },
      status: "open",
      source: "local",
      sourceMeta: { source: "local" },
      labels: [],
      createdAt: new Date("2026-05-10T08:00:00.000Z"),
      updatedAt: new Date("2026-05-10T08:00:00.000Z"),
    } satisfies TaskItem;
    taskStore.filteredTasks = [task];
    updateTaskMock.mockResolvedValueOnce({ ...task, status: "closed" });

    const wrapper = mountPage();
    await flushPromises();

    await wrapper.get('[data-test="close-task"]').trigger("click");
    await flushPromises();

    expect(updateTaskMock).toHaveBeenCalledWith("task-close", { status: "closed" });
  });

  it("deletes a local task when TaskDetailModal emits delete and clears detail state", async () => {
    const task = {
      id: "task-delete",
      projectId: "project-1",
      title: "待删除任务",
      description: { format: "plain_text", content: "" },
      status: "open",
      source: "local",
      sourceMeta: { source: "local" },
      labels: [],
      createdAt: new Date("2026-05-10T08:00:00.000Z"),
      updatedAt: new Date("2026-05-10T08:00:00.000Z"),
    } satisfies TaskItem;
    taskStore.filteredTasks = [task];
    deleteTaskMock.mockResolvedValueOnce(undefined);

    const wrapper = mountPage();
    await flushPromises();

    await wrapper.get('[data-test="view-detail"]').trigger("click");
    await flushPromises();
    expect((wrapper.vm as unknown as { showDetailModal: boolean }).showDetailModal).toBe(true);
    expect(
      (wrapper.vm as unknown as { activeDetailTask: TaskItem | null }).activeDetailTask?.id
    ).toBe("task-delete");

    const resetDetailCallsBefore = taskStore.resetDetailState.mock.calls.length;

    await wrapper.get('[data-test="delete-task"]').trigger("click");
    await flushPromises();

    expect(deleteTaskMock).toHaveBeenCalledWith("task-delete");
    expect((wrapper.vm as unknown as { showDetailModal: boolean }).showDetailModal).toBe(false);
    expect(
      (wrapper.vm as unknown as { activeDetailTask: TaskItem | null }).activeDetailTask
    ).toBeNull();
    expect(taskStore.resetDetailState.mock.calls.length).toBe(resetDetailCallsBefore + 1);
  });

  it("keeps the detail modal open when deleting a task fails", async () => {
    const task = {
      id: "task-delete-fail",
      projectId: "project-1",
      title: "删除失败任务",
      description: { format: "plain_text", content: "" },
      status: "open",
      source: "local",
      sourceMeta: { source: "local" },
      labels: [],
      createdAt: new Date("2026-05-10T08:00:00.000Z"),
      updatedAt: new Date("2026-05-10T08:00:00.000Z"),
    } satisfies TaskItem;
    taskStore.filteredTasks = [task];
    deleteTaskMock.mockRejectedValueOnce(new Error("delete failed"));

    const wrapper = mountPage();
    await flushPromises();

    await wrapper.get('[data-test="view-detail"]').trigger("click");
    await flushPromises();
    expect((wrapper.vm as unknown as { showDetailModal: boolean }).showDetailModal).toBe(true);

    const resetDetailCallsBefore = taskStore.resetDetailState.mock.calls.length;

    await wrapper.get('[data-test="delete-task"]').trigger("click");
    await flushPromises();

    expect(deleteTaskMock).toHaveBeenCalledWith("task-delete-fail");
    expect((wrapper.vm as unknown as { showDetailModal: boolean }).showDetailModal).toBe(true);
    expect(
      (wrapper.vm as unknown as { activeDetailTask: TaskItem | null }).activeDetailTask?.id
    ).toBe("task-delete-fail");
    expect(taskStore.resetDetailState.mock.calls.length).toBe(resetDetailCallsBefore);
  });
});
