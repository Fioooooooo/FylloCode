import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useWorkspaceStore } from "@renderer/stores/workspace/workspace";
import { workspaceApi } from "@renderer/api/workspace/workspace";
import { windowApi } from "@renderer/api/workspace/window";
import type { WorkspaceInfo } from "@shared/types/workspace";

const sessionMocks = vi.hoisted(() => ({
  clearSessions: vi.fn(),
  loadSessions: vi.fn(),
}));

vi.mock("@renderer/stores/session/session", () => ({
  useSessionStore: vi.fn(() => sessionMocks),
}));

vi.mock("@renderer/api/workspace/workspace", () => ({
  workspaceApi: {
    list: vi.fn(),
    getById: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
}));

vi.mock("@renderer/api/workspace/window", () => ({
  windowApi: {
    getContext: vi.fn(),
    openWorkspace: vi.fn(),
    openFolder: vi.fn(),
    openLauncher: vi.fn(),
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

function workspaceInfo(id: string, overrides: Partial<WorkspaceInfo> = {}): WorkspaceInfo {
  return {
    version: 2,
    id,
    name: `Workspace ${id}`,
    kind: "folder",
    isDeleted: false,
    folderIds: [id],
    primaryFolderId: id,
    createdAt: "2026-04-19T08:00:00.000Z",
    lastOpenedAt: "2026-04-30T08:00:00.000Z",
    primaryFolder: {
      version: 1,
      id,
      name: `Folder ${id}`,
      path: `/tmp/${id}`,
    },
    primaryFolderMetaPath: `/tmp/app-data/workspace-folders/${id}/meta.json`,
    pathMissing: false,
    ...overrides,
  };
}

describe("useWorkspaceStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("loads persisted workspaces and derives recents by lastOpenedAt", async () => {
    vi.mocked(workspaceApi.list).mockResolvedValue({
      ok: true,
      data: [workspaceInfo("b", { lastOpenedAt: "2026-04-29T08:00:00.000Z" }), workspaceInfo("a")],
    });

    const store = useWorkspaceStore();
    await store.loadWorkspaces();

    expect(store.workspaces.map((workspace) => workspace.id)).toEqual(["a", "b"]);
    expect(store.recentWorkspaces.map((workspace) => workspace.id)).toEqual(["a", "b"]);
    expect(store.isLoaded).toBe(true);
  });

  it("deduplicates concurrent ensureLoaded calls", async () => {
    vi.mocked(workspaceApi.list).mockResolvedValue({
      ok: true,
      data: [workspaceInfo("a")],
    });

    const store = useWorkspaceStore();
    await Promise.all([store.ensureLoaded(), store.ensureLoaded()]);

    expect(workspaceApi.list).toHaveBeenCalledTimes(1);
    expect(store.workspaces).toHaveLength(1);
  });

  it("loads context and list in one ordered launcher bootstrap without binding workspace", async () => {
    const order: string[] = [];
    vi.mocked(windowApi.getContext).mockImplementation(async () => {
      order.push("context");
      return { ok: true, data: { windowId: 1, role: "launcher", workspaceId: null } };
    });
    vi.mocked(workspaceApi.list).mockImplementation(async () => {
      order.push("list");
      return { ok: true, data: [workspaceInfo("a")] };
    });

    const store = useWorkspaceStore();
    await store.bootstrapWindowWorkspace();

    expect(order).toEqual(["context", "list"]);
    expect(store.windowContext).toEqual({ windowId: 1, role: "launcher", workspaceId: null });
    expect(store.currentWorkspace).toBeNull();
    expect(sessionMocks.loadSessions).not.toHaveBeenCalled();
  });

  it("loads the bound workspace and its session list by workspaceId", async () => {
    const order: string[] = [];
    vi.mocked(windowApi.getContext).mockImplementation(async () => {
      order.push("context");
      return { ok: true, data: { windowId: 2, role: "workspace", workspaceId: "a" } };
    });
    vi.mocked(workspaceApi.list).mockImplementation(async () => {
      order.push("list");
      return { ok: true, data: [] };
    });
    vi.mocked(workspaceApi.getById).mockImplementation(async (workspaceId) => {
      order.push(`workspace:${workspaceId}`);
      return { ok: true, data: workspaceInfo(workspaceId) };
    });
    sessionMocks.loadSessions.mockImplementation(async (workspaceId: string) => {
      order.push(`sessions:${workspaceId}`);
    });

    const store = useWorkspaceStore();
    await store.bootstrapWindowWorkspace();

    expect(order).toEqual(["context", "list", "workspace:a", "sessions:a"]);
    expect(store.currentWorkspace?.id).toBe("a");
    expect(sessionMocks.loadSessions).toHaveBeenCalledWith("a");
  });

  it("records missing workspace context and clears sessions", async () => {
    vi.mocked(windowApi.getContext).mockResolvedValue({
      ok: true,
      data: { windowId: 2, role: "workspace", workspaceId: "missing" },
    });
    vi.mocked(workspaceApi.list).mockResolvedValue({ ok: true, data: [] });
    vi.mocked(workspaceApi.getById).mockResolvedValue({ ok: true, data: null });

    const store = useWorkspaceStore();
    await store.bootstrapWindowWorkspace();

    expect(store.currentWorkspace).toBeNull();
    expect(store.workspaceContextError).toEqual(
      expect.objectContaining({ code: "WORKSPACE_NOT_FOUND" })
    );
    expect(sessionMocks.clearSessions).toHaveBeenCalled();
  });

  it("does not open a recent workspace whose primary folder is missing", async () => {
    const store = useWorkspaceStore();
    const result = await store.openRecentWorkspace(workspaceInfo("missing", { pathMissing: true }));

    expect(result).toBeNull();
    expect(windowApi.openWorkspace).not.toHaveBeenCalled();
    expect(mockToastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ title: "工作区目录不存在" })
    );
  });

  it("binds a workspace when the launcher window is reused", async () => {
    vi.mocked(windowApi.openWorkspace).mockResolvedValue({
      ok: true,
      data: {
        status: "bound-current",
        context: { windowId: 1, role: "workspace", workspaceId: "a" },
      },
    });
    vi.mocked(workspaceApi.list).mockResolvedValue({ ok: true, data: [workspaceInfo("a")] });
    vi.mocked(workspaceApi.getById).mockResolvedValue({ ok: true, data: workspaceInfo("a") });

    const store = useWorkspaceStore();
    const result = await store.openWorkspaceWindow("a");

    expect(result?.id).toBe("a");
    expect(store.currentWorkspace?.id).toBe("a");
    expect(store.windowContext).toEqual({
      windowId: 1,
      role: "workspace",
      workspaceId: "a",
    });
  });

  it("refreshes only the workspace that is still active", async () => {
    const store = useWorkspaceStore();
    store.currentWorkspace = workspaceInfo("a");

    let resolveGetById: ((value: Awaited<ReturnType<typeof workspaceApi.getById>>) => void) | null =
      null;
    vi.mocked(workspaceApi.getById).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveGetById = resolve;
        })
    );

    const refreshPromise = store.refreshCurrentWorkspace();
    store.currentWorkspace = workspaceInfo("b");
    resolveGetById!({
      ok: true,
      data: workspaceInfo("a", { name: "Updated A" }),
    });
    await refreshPromise;

    expect(store.currentWorkspace.id).toBe("b");
  });

  it("removes a recent workspace through the Workspace API", async () => {
    vi.mocked(workspaceApi.list).mockResolvedValue({ ok: true, data: [workspaceInfo("a")] });
    vi.mocked(workspaceApi.remove).mockResolvedValue({ ok: true, data: undefined });

    const store = useWorkspaceStore();
    await store.loadWorkspaces();
    await store.removeRecentWorkspace("a");

    expect(workspaceApi.remove).toHaveBeenCalledWith("a");
    expect(store.workspaces).toHaveLength(0);
  });
});
