import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { reactive } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TaskPage from "@renderer/pages/task.vue";
import type { TaskItem, TaskStatus } from "@shared/types/task";

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
  resetDetailState: ReturnType<typeof vi.fn>;
};

const loadTasksMock = vi.fn();
const loadTaskDetailMock = vi.fn();
const createTaskMock = vi.fn();
const updateTaskMock = vi.fn();
const deleteTaskMock = vi.fn();
const sendMessageMock = vi.fn();
const pushMock = vi.fn();
const beginDraftSessionMock = vi.fn();
const toastAddMock = vi.fn();
const { ensureTaskSubjectMock } = vi.hoisted(() => ({
  ensureTaskSubjectMock: vi.fn(),
}));

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
  resetDetailState: vi.fn(),
});

const projectStore = reactive({
  currentProject: { id: "project-1" } as { id: string } | null,
});

vi.mock("@renderer/stores/task", () => ({
  useTaskStore: () => taskStore,
}));

vi.mock("@renderer/stores/project", () => ({
  useProjectStore: () => projectStore,
}));

vi.mock("@renderer/stores/chat", () => ({
  useChatStore: () => ({
    sendMessage: sendMessageMock,
  }),
}));

vi.mock("@renderer/stores/session", () => ({
  useSessionStore: () => ({
    beginDraftSession: beginDraftSessionMock,
  }),
}));

vi.mock("@renderer/api/lineage", () => ({
  lineageApi: {
    ensureTaskSubject: ensureTaskSubjectMock,
  },
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
  props: ["task"],
  template:
    '<div data-test="task-card">{{ task.title }}<button type="button" data-test="start-discussion" @click="$emit(\'start-discussion\', task)">讨论</button></div>',
};

const createTaskModalStub = {
  props: ["open"],
  emits: ["update:open", "create"],
  template: "<div />",
};

const taskDetailModalStub = {
  props: ["open", "task", "error", "detailLoading", "detailError"],
  emits: ["update:open", "save"],
  template:
    '<div data-test="detail-modal">{{ task?.title }}|{{ detailLoading ? "loading" : "idle" }}|{{ detailError || "" }}</div>',
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

    const promptText = sendMessageMock.mock.calls[0]?.[0]?.[0]?.text as string;
    expect(ensureTaskSubjectMock).toHaveBeenCalledWith(
      "project-1",
      expect.objectContaining({
        ref: "yunxiao:yunxiao:space-1:102",
        snapshot: taskStore.filteredTasks[0],
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

    expect(ensureTaskSubjectMock).toHaveBeenCalledWith(
      "project-1",
      expect.objectContaining({
        ref: "local:task-1",
        snapshot: task,
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
      props: ["task"],
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
      props: ["task"],
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
});
