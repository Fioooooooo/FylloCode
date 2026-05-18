import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useTaskStore } from "@renderer/stores/task";
import { taskApi } from "@renderer/api/task";
import { integrationApi } from "@renderer/api/integration";
import type { ProjectIntegrationConfig } from "@shared/types/integration";

const projectStoreState = vi.hoisted(() => ({
  currentProject: { id: "project-1" } as { id: string } | null,
}));

vi.mock("@renderer/api/task", () => ({
  taskApi: {
    getTask: vi.fn(),
    listTasks: vi.fn(),
    createTask: vi.fn(),
    updateTask: vi.fn(),
    deleteTask: vi.fn(),
  },
}));

vi.mock("@renderer/api/integration", () => ({
  integrationApi: {
    getProjectIntegration: vi.fn(),
  },
}));

vi.mock("@renderer/stores/project", () => ({
  useProjectStore: () => projectStoreState,
}));

function integrationConfig(hasYunxiao: boolean): ProjectIntegrationConfig {
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
    projectStoreState.currentProject = { id: "project-1" };
    vi.mocked(taskApi.listTasks).mockResolvedValue({
      ok: true,
      data: [],
    });
    vi.mocked(taskApi.getTask).mockResolvedValue({
      ok: true,
      data: {
        id: "yunxiao:space-1:task-1",
        projectId: "project-1",
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
    vi.mocked(integrationApi.getProjectIntegration).mockResolvedValue({
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
    vi.mocked(integrationApi.getProjectIntegration).mockResolvedValue({
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
    vi.mocked(integrationApi.getProjectIntegration).mockResolvedValue({
      ok: true,
      data: integrationConfig(true),
    });

    const store = useTaskStore();
    await store.loadTasks("yunxiao");

    expect(store.availableSources).toContain("yunxiao");
    expect(integrationApi.getProjectIntegration).toHaveBeenCalledWith("project-1");
  });

  it("falls back to local when the selected source becomes unavailable after project switch", async () => {
    vi.mocked(integrationApi.getProjectIntegration)
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

    projectStoreState.currentProject = { id: "project-2" };
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
