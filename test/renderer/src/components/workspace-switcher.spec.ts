import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import WorkspaceSwitcher from "@renderer/components/layout/WorkspaceSwitcher.vue";
import type { WorkspaceInfo, WorkspaceLauncherItem } from "@shared/types/workspace";
import type { WindowContext } from "@shared/types/window";

const routeMocks = vi.hoisted(() => ({
  goToDefault: vi.fn(),
}));

const workspaceStoreMock = vi.hoisted(() => ({
  currentWorkspace: null as WorkspaceInfo | null,
  recentWorkspaces: [] as WorkspaceLauncherItem[],
  windowContext: null as WindowContext | null,
  openRecentWorkspace: vi.fn(),
  openFolderWindow: vi.fn(),
  openLauncherWindow: vi.fn(),
}));

vi.mock("@renderer/composables/useDefaultAppRoute", () => ({
  useDefaultAppRoute: () => ({
    goToDefault: routeMocks.goToDefault,
  }),
}));

vi.mock("@renderer/stores", () => ({
  useWorkspaceStore: () => workspaceStoreMock,
}));

const dropdownMenuStub = {
  props: ["items", "ui"],
  template: `
    <div data-test="dropdown-menu-stub" :data-content-class="ui && ui.content">
      <slot :open="true" />
      <template v-for="item in items" :key="item.label || item.type">
        <button
          v-if="item.workspace"
          type="button"
          :data-test="\`dropdown-item-\${item.label}\`"
          @click="item.onSelect?.()"
        >
          <slot name="item" :item="item" />
        </button>
        <span v-else-if="item.type === 'label'"><slot name="item" :item="item" /></span>
        <hr v-else-if="item.type === 'separator'" />
        <button
          v-else
          type="button"
          :disabled="item.disabled"
          :data-icon="item.icon"
          :data-test="\`dropdown-item-\${item.label}\`"
          @click="item.onSelect?.()"
        >
          <slot name="item" :item="item" />
        </button>
      </template>
    </div>
  `,
};

function launcher(overrides: Partial<WorkspaceLauncherItem> = {}): WorkspaceLauncherItem {
  return {
    workspaceId: "project-a",
    workspaceName: "Project A",
    workspaceKind: "folder",
    primaryFolderId: "folder-a",
    primaryFolderPath: "/tmp/project-a",
    folderCount: 1,
    folderPaths: ["/tmp/project-a"],
    folders: [
      {
        folderId: "folder-a",
        folderName: "Project A",
        folderPath: "/tmp/project-a",
        pathMissing: false,
        isPrimary: true,
      },
    ],
    missingFolderCount: 0,
    lastOpenedAt: "2026-08-04T00:00:00.000Z",
    isDeleted: false,
    ...overrides,
  };
}

function workspaceInfo(overrides: Partial<WorkspaceInfo> = {}): WorkspaceInfo {
  return {
    version: 2,
    id: "workspace-a",
    name: "Workspace A",
    kind: "collection",
    isDeleted: false,
    folderIds: ["folder-a"],
    primaryFolderId: "folder-a",
    createdAt: "2026-08-03T00:00:00.000Z",
    lastOpenedAt: "2026-08-04T00:00:00.000Z",
    primaryFolder: {
      version: 1,
      id: "folder-a",
      name: "FylloCode",
      path: "/tmp/fyllocode",
    },
    primaryFolderMetaPath: "/tmp/fyllocode/.fyllocode/folder.json",
    pathMissing: false,
    folders: [
      {
        folderId: "folder-a",
        folderName: "FylloCode",
        folderPath: "/tmp/fyllocode",
        pathMissing: false,
        isPrimary: true,
      },
    ],
    availableFolders: [
      {
        folderId: "folder-a",
        folderName: "FylloCode",
        folderPath: "/tmp/fyllocode",
        pathMissing: false,
        isPrimary: true,
      },
    ],
    missingFolders: [],
    chatAvailable: true,
    ...overrides,
  };
}

function mountSwitcher() {
  return mount(WorkspaceSwitcher, {
    global: {
      stubs: {
        UDropdownMenu: dropdownMenuStub,
        DropdownMenu: dropdownMenuStub,
      },
    },
  });
}

describe("WorkspaceSwitcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workspaceStoreMock.currentWorkspace = workspaceInfo();
    workspaceStoreMock.recentWorkspaces = [];
    workspaceStoreMock.windowContext = {
      windowId: 1,
      role: "workspace",
      workspaceId: "workspace-a",
    };
    workspaceStoreMock.openRecentWorkspace.mockResolvedValue(null);
    workspaceStoreMock.openFolderWindow.mockResolvedValue(null);
    workspaceStoreMock.openLauncherWindow.mockResolvedValue(undefined);
  });

  it("routes recent, open, and manage actions through the Workspace store", async () => {
    const project = launcher({ workspaceId: "project-b", workspaceName: "Project B" });
    workspaceStoreMock.recentWorkspaces = [project];
    workspaceStoreMock.openFolderWindow.mockResolvedValueOnce(
      workspaceInfo({
        id: "project-c",
        name: "Project C",
        kind: "folder",
      })
    );
    const wrapper = mountSwitcher();

    await wrapper.get('[data-test="dropdown-item-Project B · Project"]').trigger("click");
    await wrapper.get('[data-test="dropdown-item-打开 Project…"]').trigger("click");
    await wrapper.get('[data-test="dropdown-item-管理 Project 与 Workspace…"]').trigger("click");
    await flushPromises();

    expect(workspaceStoreMock.openRecentWorkspace).toHaveBeenCalledWith(project);
    expect(workspaceStoreMock.openFolderWindow).toHaveBeenCalledOnce();
    expect(routeMocks.goToDefault).toHaveBeenCalledOnce();
    expect(workspaceStoreMock.openLauncherWindow).toHaveBeenCalledOnce();
  });

  it("does not show the redundant manage action in a Launcher window", () => {
    workspaceStoreMock.windowContext = { windowId: 2, role: "launcher", workspaceId: null };

    const wrapper = mountSwitcher();

    expect(wrapper.find('[data-test="dropdown-item-管理 Project 与 Workspace…"]').exists()).toBe(
      false
    );
    expect(wrapper.find('[data-test="dropdown-item-打开 Project…"]').exists()).toBe(true);
  });

  it("renders Project and Workspace identity, summaries, selection, and missing state", () => {
    workspaceStoreMock.currentWorkspace = workspaceInfo();
    workspaceStoreMock.recentWorkspaces = [
      launcher({ workspaceId: "project-b", workspaceName: "Project B" }),
      launcher({
        workspaceId: "workspace-a",
        workspaceName: "Workspace A",
        workspaceKind: "collection",
        folderCount: 1,
        primaryFolderId: "folder-a",
        primaryFolderPath: "/tmp/fyllocode",
        folderPaths: ["/tmp/fyllocode"],
        folders: [
          {
            folderId: "folder-a",
            folderName: "FylloCode",
            folderPath: "/tmp/fyllocode",
            pathMissing: false,
            isPrimary: true,
          },
        ],
      }),
      launcher({
        workspaceId: "research-lab",
        workspaceName: "Research Lab",
        workspaceKind: "collection",
        folderCount: 4,
        missingFolderCount: 1,
      }),
    ];
    const wrapper = mountSwitcher();

    const trigger = wrapper.get('[data-test="workspace-switcher-trigger"]');
    expect(trigger.element.tagName).toBe("BUTTON");
    expect(trigger.attributes("aria-expanded")).toBe("true");
    expect(trigger.attributes("aria-label")).toContain("当前 Workspace A，Workspace，1 个 Project");
    expect(trigger.text()).toContain("1 Project");
    expect(trigger.find('[data-icon-name="i-lucide-layout-grid"]').exists()).toBe(true);

    const projectItem = wrapper.get('[data-test="dropdown-item-Project B · Project"]');
    expect(projectItem.text()).toContain("Project");
    expect(projectItem.text()).toContain("/tmp/project-a");
    expect(projectItem.find('[data-icon-name="i-lucide-folder"]').exists()).toBe(true);

    const workspaceItem = wrapper.get('[data-test="dropdown-item-Workspace A · Workspace"]');
    expect(workspaceItem.text()).toContain("Workspace");
    expect(workspaceItem.text()).toContain("1 Project · 主 Project：FylloCode");
    expect(workspaceItem.find('[data-icon-name="i-lucide-layout-grid"]').exists()).toBe(true);
    expect(workspaceItem.find('[aria-label="当前"]').exists()).toBe(true);

    const missingItem = wrapper.get('[data-test="dropdown-item-Research Lab · Workspace"]');
    expect(missingItem.text()).toContain("1 个项目目录缺失");
    expect(missingItem.find('[data-icon-name="i-lucide-triangle-alert"]').exists()).toBe(true);
  });

  it("keeps a Project trigger and long recent content inside the truncating scroll layout", () => {
    const longName = "FylloCode Project With A Deliberately Long Name For Header Layout Testing";
    workspaceStoreMock.currentWorkspace = workspaceInfo({
      id: "project-long",
      name: longName,
      kind: "folder",
    });
    workspaceStoreMock.recentWorkspaces = [
      launcher({
        workspaceId: "project-long",
        workspaceName: longName,
        primaryFolderPath:
          "/Users/example/Projects/a-very-long-folder-name/with/additional/nested/segments/fyllocode",
      }),
    ];
    const wrapper = mountSwitcher();

    const trigger = wrapper.get('[data-test="workspace-switcher-trigger"]');
    expect(trigger.attributes("aria-label")).toContain(`当前 ${longName}，Project`);
    expect(trigger.text()).not.toMatch(/\d+ Projects?/);
    expect(trigger.find('[data-icon-name="i-lucide-folder"]').exists()).toBe(true);
    expect(trigger.find(".truncate").exists()).toBe(true);

    const menu = wrapper.get('[data-test="dropdown-menu-stub"]');
    expect(menu.attributes("data-content-class")).toContain("max-h-80");
    expect(menu.attributes("data-content-class")).toContain("overflow-y-auto");

    const projectItem = wrapper.get(`[data-test="dropdown-item-${longName} · Project"]`);
    expect(projectItem.findAll(".truncate").length).toBeGreaterThanOrEqual(2);
  });
});
