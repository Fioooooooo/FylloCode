import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { suggestTaskProposalOwner, useTaskStore } from "@renderer/stores/automation/task";
import { workspaceIntegrationApi } from "@renderer/api/automation/workspace-integration";
import { taskApi } from "@renderer/api/automation/task";
import type { WorkspaceIntegrationConfig } from "@shared/types/integration";
import type { TaskItem } from "@shared/types/task";
import type { WorkspaceFolderInfo } from "@shared/types/workspace";

const workspaceStoreState = vi.hoisted(() => ({
  currentWorkspace: { id: "project-1" } as {
    id: string;
    folders?: WorkspaceFolderInfo[];
  } | null,
}));

vi.mock("@renderer/api/automation/task", () => ({
  taskApi: {
    getTask: vi.fn(),
    listTasks: vi.fn(),
    createTask: vi.fn(),
    updateTask: vi.fn(),
    deleteTask: vi.fn(),
  },
}));

vi.mock("@renderer/api/automation/workspace-integration", () => ({
  workspaceIntegrationApi: {
    getWorkspaceIntegration: vi.fn(),
  },
}));

vi.mock("@renderer/stores/workspace/workspace", () => ({
  useWorkspaceStore: () => workspaceStoreState,
}));

function integrationConfig(hasYunxiao: boolean): WorkspaceIntegrationConfig {
  return {
    "project-management": hasYunxiao
      ? [
          {
            providerId: "yunxiao",
            resourceType: "projex-project",
            resourceId: "space-1",
          },
        ]
      : [],
    "source-control": [],
    "ci-cd": [],
    deployment: [],
    communication: [],
    observability: [],
  } as const;
}

describe("useTaskStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    workspaceStoreState.currentWorkspace = { id: "project-1" };
    vi.mocked(taskApi.listTasks).mockResolvedValue({
      ok: true,
      data: [],
    });
    vi.mocked(taskApi.getTask).mockResolvedValue({
      ok: true,
      data: {
        id: "yunxiao:space-1:task-1",
        workspaceId: "project-1",
        title: "云效任务",
        description: {
          format: "html",
          content: "<p>详情描述</p>",
        },
        status: "open",
        source: "yunxiao",
        sourceMeta: { source: "yunxiao", key: "YX-1", issueType: "任务" },
        labels: [],
        createdAt: new Date("2026-05-10T08:00:00.000Z"),
        updatedAt: new Date("2026-05-10T08:00:00.000Z"),
      },
    });
    vi.mocked(workspaceIntegrationApi.getWorkspaceIntegration).mockResolvedValue({
      ok: true,
      data: integrationConfig(false),
    });
  });

  it("shows only local source when the project has no mounted yunxiao resource", async () => {
    const store = useTaskStore();

    await store.loadTasks("local");

    expect(store.availableSources).toEqual(["local"]);
    expect(store.sourceTabs).toEqual([{ label: "本地", value: "local" }]);
  });

  it("shows yunxiao source when the project has mounted yunxiao resources", async () => {
    vi.mocked(workspaceIntegrationApi.getWorkspaceIntegration).mockResolvedValue({
      ok: true,
      data: integrationConfig(true),
    });

    const store = useTaskStore();
    await store.loadTasks("yunxiao");

    expect(store.availableSources).toEqual(["local", "yunxiao"]);
    expect(store.sourceTabs).toEqual([
      { label: "本地", value: "local" },
      { label: "云效", value: "yunxiao" },
    ]);
  });

  it("keeps yunxiao visible even if provider connectivity is not queried here", async () => {
    vi.mocked(workspaceIntegrationApi.getWorkspaceIntegration).mockResolvedValue({
      ok: true,
      data: integrationConfig(true),
    });

    const store = useTaskStore();
    await store.loadTasks("yunxiao");

    expect(store.availableSources).toContain("yunxiao");
    expect(workspaceIntegrationApi.getWorkspaceIntegration).toHaveBeenCalledWith("project-1");
  });

  it("falls back to local when the selected source becomes unavailable after project switch", async () => {
    vi.mocked(workspaceIntegrationApi.getWorkspaceIntegration)
      .mockResolvedValueOnce({
        ok: true,
        data: integrationConfig(true),
      })
      .mockResolvedValueOnce({
        ok: true,
        data: integrationConfig(false),
      });

    const store = useTaskStore();
    await store.loadTasks("yunxiao");
    expect(store.sourceFilter).toBe("yunxiao");

    workspaceStoreState.currentWorkspace = { id: "project-2" };
    await store.loadTasks("yunxiao");

    expect(store.availableSources).toEqual(["local"]);
    expect(store.sourceFilter).toBe("local");
    expect(taskApi.listTasks).toHaveBeenLastCalledWith("project-2", "local");
  });

  it("loads task detail with isolated loading state", async () => {
    const store = useTaskStore();

    const detail = await store.loadTaskDetail("yunxiao:space-1:task-1");

    expect(detail.description).toEqual({
      format: "html",
      content: "<p>详情描述</p>",
    });
    expect(store.detailLoadingTaskId).toBeNull();
    expect(store.detailErrorTaskId).toBeNull();
    expect(store.error).toBeNull();
    expect(taskApi.getTask).toHaveBeenCalledWith("project-1", "yunxiao:space-1:task-1");
  });

  it("builds distinct lineage refs for same-name tasks with different IDs", () => {
    const store = useTaskStore();
    const base = {
      workspaceId: "project-1",
      title: "同名任务",
      source: "local" as const,
    };

    expect(store.buildTaskRef({ ...base, id: "task-a" } as TaskItem)).toBe("local:task-a");
    expect(store.buildTaskRef({ ...base, id: "task-b" } as TaskItem)).toBe("local:task-b");
  });

  it("adds an explicit confirmed owner suggestion to the task discussion prompt", () => {
    workspaceStoreState.currentWorkspace = {
      id: "project-1",
      folders: [
        {
          folderId: "folder-a",
          folderName: "Repository A",
          folderPath: "/repos/a",
          pathMissing: false,
          isPrimary: true,
        },
      ],
    };
    const store = useTaskStore();
    const prompt = store.buildTaskPrompt({
      id: "task-a",
      workspaceId: "project-1",
      title: "Targeted task",
      description: { format: "plain_text", content: "" },
      status: "open",
      source: "local",
      sourceMeta: { source: "local" },
      labels: [],
      targetFolderIds: ["folder-a"],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    expect(prompt).toContain("建议 Proposal Owner");
    expect(prompt).toContain("Repository A (folderId: folder-a)");
    expect(prompt).toContain("显式传入 folderId");
  });

  it("keeps list error clean when detail loading fails", async () => {
    vi.mocked(taskApi.getTask).mockResolvedValueOnce({
      ok: false,
      error: {
        code: "TASK_NOT_FOUND",
        message: "missing",
      },
    });

    const store = useTaskStore();

    await expect(store.loadTaskDetail("yunxiao:space-1:missing")).rejects.toThrow("missing");
    expect(store.error).toBeNull();
    expect(store.detailLoadingTaskId).toBeNull();
    expect(store.detailErrorTaskId).toBe("yunxiao:space-1:missing");
    expect(store.detailErrorMessage).toBe("missing");
  });
});

describe("suggestTaskProposalOwner", () => {
  const folders = [
    {
      folderId: "folder-a",
      folderName: "App",
      folderPath: "/repos/app",
      pathMissing: false,
      isPrimary: true,
    },
    {
      folderId: "folder-b",
      folderName: "API",
      folderPath: "/repos/api",
      pathMissing: false,
      isPrimary: false,
    },
  ];
  const task = (overrides: Partial<TaskItem> = {}): TaskItem => ({
    id: "task-1",
    workspaceId: "workspace-1",
    title: "Task",
    description: { format: "plain_text", content: "" },
    status: "open",
    source: "local",
    sourceMeta: { source: "local" },
    labels: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  const targetCases: Array<[string, string[] | undefined, string | null]> = [
    ["no targets", undefined, null],
    ["one valid target", ["folder-b"], "folder-b"],
    ["one stale target", ["removed"], null],
    ["multiple original targets", ["folder-a", "removed"], null],
    ["duplicate targets normalize to one", ["folder-a", "folder-a"], "folder-a"],
  ];

  it.each(targetCases)("handles %s", (_label, targetFolderIds, expected) => {
    expect(suggestTaskProposalOwner(task({ targetFolderIds }), folders)).toBe(expected);
  });

  it("accepts a unique external repository match only when it is a current available member", () => {
    const external = task({
      source: "github",
      sourceMeta: { source: "github", repository: "example/api", number: 12 },
    });

    expect(suggestTaskProposalOwner(external, folders)).toBe("folder-b");
    expect(
      suggestTaskProposalOwner(external, [
        ...folders,
        { ...folders[1]!, folderId: "folder-c", folderPath: "/other/api" },
      ])
    ).toBeNull();
    expect(suggestTaskProposalOwner(external, [{ ...folders[1]!, pathMissing: true }])).toBeNull();
  });
});
