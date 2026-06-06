import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useProjectStore } from "@renderer/stores/project";
import { projectApi } from "@renderer/api/project";

vi.mock("@renderer/api/project", () => ({
  projectApi: {
    list: vi.fn(),
    getById: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    openFolder: vi.fn(),
  },
}));

const mockToastAdd = vi.fn();

vi.mock("@nuxt/ui/composables", async () => {
  const actual = await vi.importActual<object>("@nuxt/ui/composables");
  return {
    ...actual,
    useToast: vi.fn(() => ({ add: mockToastAdd })),
  };
});

describe("useProjectStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("loads persisted projects and derives recent projects by lastOpenedAt", async () => {
    vi.mocked(projectApi.list).mockResolvedValue({
      ok: true,
      data: [
        {
          id: "b",
          name: "Project B",
          path: "/tmp/b",
          metaPath: "/tmp/b-meta.json",
          createdAt: "2026-04-20T08:00:00.000Z" as unknown as Date,
          lastOpenedAt: "2026-04-29T08:00:00.000Z" as unknown as Date,
        },
        {
          id: "a",
          name: "Project A",
          path: "/tmp/a",
          metaPath: "/tmp/a-meta.json",
          createdAt: "2026-04-19T08:00:00.000Z" as unknown as Date,
          lastOpenedAt: "2026-04-30T08:00:00.000Z" as unknown as Date,
        },
      ],
    });

    const store = useProjectStore();
    await store.loadProjects();

    expect(store.projects.map((project) => project.id)).toEqual(["a", "b"]);
    expect(store.recentProjects.map((project) => project.id)).toEqual(["a", "b"]);
    expect(store.projects[0]?.name).toBe("Project A");
    expect(store.isLoaded).toBe(true);
  });

  it("deduplicates concurrent ensureLoaded calls", async () => {
    vi.mocked(projectApi.list).mockResolvedValue({
      ok: true,
      data: [
        {
          id: "a",
          name: "Project A",
          path: "/tmp/a",
          metaPath: "/tmp/a-meta.json",
          createdAt: "2026-04-19T08:00:00.000Z" as unknown as Date,
          lastOpenedAt: "2026-04-30T08:00:00.000Z" as unknown as Date,
        },
      ],
    });

    const store = useProjectStore();
    await Promise.all([store.ensureLoaded(), store.ensureLoaded()]);

    expect(projectApi.list).toHaveBeenCalledTimes(1);
    expect(store.isLoaded).toBe(true);
    expect(store.projects).toHaveLength(1);
  });

  it("does not activate a recent project when the project path is missing", async () => {
    vi.mocked(projectApi.getById).mockResolvedValue({
      ok: true,
      data: {
        id: "missing",
        name: "Missing Project",
        path: "/tmp/missing",
        metaPath: "/tmp/missing-meta.json",
        createdAt: "2026-04-20T08:00:00.000Z" as unknown as Date,
        lastOpenedAt: "2026-04-30T08:00:00.000Z" as unknown as Date,
        pathMissing: true,
      },
    });

    const store = useProjectStore();
    const result = await store.openRecentProject({
      id: "missing",
      name: "Missing Project",
      path: "/tmp/missing",
      createdAt: new Date("2026-04-20T08:00:00.000Z"),
      lastOpenedAt: new Date("2026-04-30T08:00:00.000Z"),
    });

    expect(result).toBeNull();
    expect(store.currentProject).toBeNull();
    expect(mockToastAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "项目目录不存在",
      })
    );
    expect(projectApi.update).not.toHaveBeenCalled();
  });

  it("removes a recent project through the IPC API", async () => {
    vi.mocked(projectApi.list).mockResolvedValue({
      ok: true,
      data: [
        {
          id: "a",
          name: "Project A",
          path: "/tmp/a",
          metaPath: "/tmp/a-meta.json",
          createdAt: "2026-04-19T08:00:00.000Z" as unknown as Date,
          lastOpenedAt: "2026-04-30T08:00:00.000Z" as unknown as Date,
        },
      ],
    });
    vi.mocked(projectApi.remove).mockResolvedValue({
      ok: true,
      data: undefined,
    });

    const store = useProjectStore();
    await store.loadProjects();
    await store.removeRecentProject("a");

    expect(projectApi.remove).toHaveBeenCalledWith("a");
    expect(store.projects).toHaveLength(0);
    expect(store.recentProjects).toHaveLength(0);
  });

  it("refreshes the active project in place without clearing sessions", async () => {
    const store = useProjectStore();
    store.projects = [
      {
        id: "a",
        name: "Project A",
        path: "/tmp/a",
        metaPath: "/tmp/a-meta.json",
        createdAt: new Date("2026-04-19T08:00:00.000Z"),
        lastOpenedAt: new Date("2026-04-30T08:00:00.000Z"),
      },
    ];
    store.currentProject = store.projects[0]!;
    vi.mocked(projectApi.getById).mockResolvedValue({
      ok: true,
      data: {
        id: "a",
        name: "Project A",
        path: "/tmp/a",
        metaPath: "/tmp/a-meta.json",
        healthScore: 75,
        createdAt: "2026-04-19T08:00:00.000Z" as unknown as Date,
        lastOpenedAt: "2026-05-01T08:00:00.000Z" as unknown as Date,
      },
    });

    await store.refreshCurrentProject();

    expect(projectApi.getById).toHaveBeenCalledWith("a");
    expect(store.currentProject?.healthScore).toBe(75);
    expect(store.projects[0]?.healthScore).toBe(75);
  });

  it("keeps the active project unchanged when refresh fails", async () => {
    const store = useProjectStore();
    store.currentProject = {
      id: "a",
      name: "Project A",
      path: "/tmp/a",
      metaPath: "/tmp/a-meta.json",
      healthScore: 20,
      createdAt: new Date("2026-04-19T08:00:00.000Z"),
      lastOpenedAt: new Date("2026-04-30T08:00:00.000Z"),
    };
    vi.mocked(projectApi.getById).mockResolvedValue({
      ok: false,
      error: { code: "UNKNOWN_ERROR", message: "network failed" },
    });

    await expect(store.refreshCurrentProject()).rejects.toThrow("network failed");

    expect(store.currentProject?.healthScore).toBe(20);
  });

  it("does not overwrite currentProject when active project changes during refresh", async () => {
    const store = useProjectStore();
    const projectA = {
      id: "a",
      name: "Project A",
      path: "/tmp/a",
      metaPath: "/tmp/a-meta.json",
      healthScore: 20,
      createdAt: new Date("2026-04-19T08:00:00.000Z"),
      lastOpenedAt: new Date("2026-04-30T08:00:00.000Z"),
    };
    const projectB = {
      id: "b",
      name: "Project B",
      path: "/tmp/b",
      metaPath: "/tmp/b-meta.json",
      healthScore: 90,
      createdAt: new Date("2026-04-21T08:00:00.000Z"),
      lastOpenedAt: new Date("2026-05-02T08:00:00.000Z"),
    };
    store.projects = [projectA, projectB];
    store.currentProject = projectA;

    let resolveGetById: ((value: unknown) => void) | null = null;
    vi.mocked(projectApi.getById).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveGetById = resolve as (value: unknown) => void;
        })
    );

    const refreshPromise = store.refreshCurrentProject();
    store.currentProject = projectB;

    resolveGetById!({
      ok: true,
      data: {
        id: "a",
        name: "Project A",
        path: "/tmp/a",
        metaPath: "/tmp/a-meta.json",
        healthScore: 75,
        createdAt: "2026-04-19T08:00:00.000Z" as unknown as Date,
        lastOpenedAt: "2026-05-01T08:00:00.000Z" as unknown as Date,
      },
    });
    await refreshPromise;

    expect(store.currentProject?.id).toBe("b");
    expect(store.currentProject?.healthScore).toBe(90);
  });
});
