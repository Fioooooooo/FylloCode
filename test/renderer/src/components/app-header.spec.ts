import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import AppHeader from "@renderer/components/layout/AppHeader.vue";

const routeMocks = vi.hoisted(() => ({
  goToDefault: vi.fn(),
}));

const workspaceStoreMock = vi.hoisted(() => ({
  currentWorkspace: { name: "FylloCode" },
  recentWorkspaces: [] as Array<{
    workspaceId: string;
    workspaceName: string;
    workspaceKind: "folder" | "collection";
    primaryFolderId: string;
    primaryFolderPath: string;
    folderCount: number;
    folderPaths: string[];
    folders: Array<{ folderId: string; folderPath: string; pathMissing: boolean }>;
    missingFolderCount: number;
    lastOpenedAt: string;
    isDeleted: boolean;
  }>,
  openFolderWindow: vi.fn(),
  openWorkspaceWindow: vi.fn(),
  openRecentWorkspace: vi.fn(),
}));

vi.mock("@renderer/api/platform/app", () => ({
  appApi: {
    openDevTools: vi.fn().mockResolvedValue({ ok: true }),
  },
}));

vi.mock("@renderer/composables/useDefaultAppRoute", () => ({
  useDefaultAppRoute: () => ({
    goToDefault: routeMocks.goToDefault,
  }),
}));

vi.mock("@renderer/stores/workspace/workspace", () => ({
  useWorkspaceStore: () => workspaceStoreMock,
}));

vi.mock("@vueuse/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@vueuse/core")>()),
  useColorMode: () => ref("light"),
}));

const tooltipStub = {
  props: ["text", "disableHoverableContent", "ignoreNonKeyboardFocus"],
  template:
    '<div data-test="app-header-tooltip" :data-text="text" :data-disable-hoverable-content="String(disableHoverableContent)" :data-ignore-non-keyboard-focus="String(ignoreNonKeyboardFocus)"><slot /></div>',
};

function mountAppHeader() {
  return mount(AppHeader, {
    global: {
      stubs: {
        ProjectHealthPopover: true,
        UTooltip: tooltipStub,
        Tooltip: tooltipStub,
      },
    },
  });
}

describe("AppHeader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workspaceStoreMock.recentWorkspaces = [];
    workspaceStoreMock.openFolderWindow.mockResolvedValue(null);
    workspaceStoreMock.openWorkspaceWindow.mockResolvedValue(null);
    workspaceStoreMock.openRecentWorkspace.mockResolvedValue(null);
  });

  it("keeps tooltip hover behavior scoped to header controls", () => {
    const wrapper = mountAppHeader();

    const tooltips = wrapper.findAll('[data-test="app-header-tooltip"]');
    expect(tooltips.map((tooltip) => tooltip.attributes("data-text"))).toEqual([
      "打开开发者工具",
      "通知",
      "切换主题",
    ]);
    for (const tooltip of tooltips) {
      expect(tooltip.attributes("data-disable-hoverable-content")).toBe("true");
      expect(tooltip.attributes("data-ignore-non-keyboard-focus")).toBe("true");
    }
  });

  it("opens a recent project through the recent-project store path", async () => {
    const project = {
      workspaceId: "project-b",
      workspaceName: "Project B",
      workspaceKind: "folder" as const,
      primaryFolderId: "project-b",
      primaryFolderPath: "/tmp/project-b",
      folderCount: 1,
      folderPaths: ["/tmp/project-b"],
      folders: [{ folderId: "project-b", folderPath: "/tmp/project-b", pathMissing: false }],
      missingFolderCount: 0,
      lastOpenedAt: "2026-07-07T00:00:00.000Z",
      isDeleted: false,
    };
    workspaceStoreMock.recentWorkspaces = [project];
    const wrapper = mountAppHeader();

    await wrapper.get('[data-test="dropdown-item-Project B · Project"]').trigger("click");
    await flushPromises();

    expect(workspaceStoreMock.openRecentWorkspace).toHaveBeenCalledWith(project);
    expect(workspaceStoreMock.openWorkspaceWindow).not.toHaveBeenCalled();
  });

  it("routes missing-path recent projects through openRecentWorkspace without direct window open", async () => {
    const project = {
      workspaceId: "project-missing",
      workspaceName: "Missing Project",
      workspaceKind: "folder" as const,
      primaryFolderId: "project-missing",
      primaryFolderPath: "/tmp/missing",
      folderCount: 1,
      folderPaths: ["/tmp/missing"],
      folders: [{ folderId: "project-missing", folderPath: "/tmp/missing", pathMissing: true }],
      missingFolderCount: 1,
      lastOpenedAt: "2026-07-07T00:00:00.000Z",
      isDeleted: false,
    };
    workspaceStoreMock.recentWorkspaces = [project];
    const wrapper = mountAppHeader();

    await wrapper.get('[data-test="dropdown-item-Missing Project · Project"]').trigger("click");
    await flushPromises();

    expect(workspaceStoreMock.openRecentWorkspace).toHaveBeenCalledWith(project);
    expect(workspaceStoreMock.openWorkspaceWindow).not.toHaveBeenCalled();
  });

  it("navigates only when opening a folder binds the current window", async () => {
    workspaceStoreMock.openFolderWindow.mockResolvedValueOnce({
      id: "project-a",
      name: "Project A",
      path: "/tmp/project-a",
      metaPath: "/tmp/project-a/meta.json",
      createdAt: new Date("2026-07-06T00:00:00.000Z"),
      lastOpenedAt: new Date("2026-07-07T00:00:00.000Z"),
    });
    const wrapper = mountAppHeader();

    await wrapper.get('[data-test="dropdown-item-打开 Project"]').trigger("click");
    await flushPromises();

    expect(workspaceStoreMock.openFolderWindow).toHaveBeenCalled();
    expect(routeMocks.goToDefault).toHaveBeenCalled();
  });

  it("keeps a single-member collection labeled as Workspace", () => {
    workspaceStoreMock.recentWorkspaces = [
      {
        workspaceId: "workspace-a",
        workspaceName: "Workspace A",
        workspaceKind: "collection",
        primaryFolderId: "project-a",
        primaryFolderPath: "/tmp/project-a",
        folderCount: 1,
        folderPaths: ["/tmp/project-a"],
        folders: [{ folderId: "project-a", folderPath: "/tmp/project-a", pathMissing: false }],
        missingFolderCount: 0,
        lastOpenedAt: "2026-07-07T00:00:00.000Z",
        isDeleted: false,
      },
    ];

    const wrapper = mountAppHeader();

    expect(wrapper.find('[data-test="dropdown-item-Workspace A · Workspace"]').exists()).toBe(true);
  });
});
