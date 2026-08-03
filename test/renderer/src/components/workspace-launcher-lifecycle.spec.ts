import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import WorkspaceList from "@renderer/components/welcome/WorkspaceList.vue";
import WorkspaceEditorModal from "@renderer/components/welcome/WorkspaceEditorModal.vue";
import DeletedWorkspaceManager from "@renderer/components/welcome/DeletedWorkspaceManager.vue";
import type { WorkspaceLauncherItem } from "@shared/types/workspace";

const mocks = vi.hoisted(() => ({
  recentWorkspaces: [] as WorkspaceLauncherItem[],
  deletedWorkspaces: [] as WorkspaceLauncherItem[],
  selectFolder: vi.fn(),
  createCollection: vi.fn(),
  updateDefinition: vi.fn(),
  relocateFolder: vi.fn(),
  getWorkspace: vi.fn(),
  loadDeletedWorkspaces: vi.fn(),
  restoreDeletedWorkspace: vi.fn(),
  permanentlyDeleteWorkspace: vi.fn(),
  confirm: vi.fn(),
}));

vi.mock("@renderer/stores", () => ({ useWorkspaceStore: () => mocks }));
vi.mock("@renderer/composables/useConfirmDialog", () => ({
  useConfirmDialog: () => mocks.confirm,
}));

const modalStub = {
  template: '<section><slot name="body"/><slot name="footer"/></section>',
};
const buttonStub = {
  emits: ["click"],
  template: '<button type="button" @click="$emit(\'click\')"><slot/></button>',
};
const commonStubs = {
  UModal: modalStub,
  UButton: buttonStub,
  UFormField: { template: "<label><slot/></label>" },
  UInput: { template: "<input />" },
  UIcon: true,
  UBadge: { template: "<span><slot/></span>" },
};

function launcher(overrides: Partial<WorkspaceLauncherItem> = {}): WorkspaceLauncherItem {
  return {
    workspaceId: "workspace-1",
    workspaceName: "Workspace One",
    workspaceKind: "folder",
    primaryFolderId: "folder-1",
    primaryFolderPath: "/work/one",
    folderCount: 1,
    folderPaths: ["/work/one"],
    folders: [
      {
        folderId: "folder-1",
        folderName: "One",
        folderPath: "/work/one",
        pathMissing: false,
        isPrimary: true,
      },
    ],
    missingFolderCount: 0,
    lastOpenedAt: "2026-08-02T00:00:00.000Z",
    isDeleted: false,
    ...overrides,
  };
}

describe("Project/Workspace launcher lifecycle UI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.recentWorkspaces = [];
    mocks.deletedWorkspaces = [];
    mocks.confirm.mockResolvedValue(true);
  });

  it("renders Project and Workspace identity with missing Project details", () => {
    mocks.recentWorkspaces = [
      launcher(),
      launcher({
        workspaceId: "collection-1",
        workspaceName: "Collection One",
        workspaceKind: "collection",
        folderCount: 2,
        folderPaths: ["/work/one", "/work/missing"],
        missingFolderCount: 1,
        folders: [
          launcher().folders[0],
          {
            folderId: "folder-2",
            folderName: "Missing",
            folderPath: "/work/missing",
            pathMissing: true,
            isPrimary: false,
          },
        ],
      }),
    ];
    const wrapper = mount(WorkspaceList, { global: { stubs: commonStubs } });
    expect(wrapper.text()).toContain("Project");
    expect(wrapper.text()).toContain("Workspace");
    expect(wrapper.text()).not.toContain("Folder Workspace");
    expect(wrapper.text()).not.toContain("Collection Workspace");
    expect(wrapper.text()).toContain("查看全部 2 个 Project");
    expect(wrapper.text()).toContain("主 Project：/work/one");
    expect(wrapper.text()).toContain("1 个缺失");
    expect(wrapper.text()).toContain("/work/missing");
    expect(wrapper.text()).toContain("项目目录缺失");
    expect(wrapper.text()).not.toContain("主 Project ·");
  });

  it("keeps a single-member collection presented as a Workspace", () => {
    mocks.recentWorkspaces = [
      launcher({
        workspaceKind: "collection",
        workspaceName: "Solo Workspace",
        folderCount: 1,
      }),
    ];

    const wrapper = mount(WorkspaceList, { global: { stubs: commonStubs } });

    expect(wrapper.text()).toContain("Solo WorkspaceWorkspace");
    expect(wrapper.text()).toContain("查看全部 1 个 Project");
    expect(wrapper.text()).toContain("主 Project：/work/one");
  });

  it("keeps Project member controls hidden in edit mode", () => {
    const wrapper = mount(WorkspaceEditorModal, {
      props: { open: true, mode: "edit", workspace: launcher() },
      global: { stubs: commonStubs },
    });
    expect(wrapper.text()).toContain("编辑 Project");
    expect(wrapper.text()).toContain("Project 目录");
    expect(wrapper.text()).not.toContain("Project（1/16）");
    expect(wrapper.text()).toContain("如需组合多个 Project，请创建 Workspace");
    expect(wrapper.find('[aria-label="移除 Project"]').exists()).toBe(false);
    expect(wrapper.find('[aria-label="重新定位项目目录"]').exists()).toBe(true);
  });

  it("offers restore only for restorable tombstones and retries failed cleanup", async () => {
    mocks.deletedWorkspaces = [
      launcher({ isDeleted: true, cleanupState: "restorable" }),
      launcher({ workspaceId: "failed", isDeleted: true, cleanupState: "cleanup-failed" }),
    ];
    const wrapper = mount(DeletedWorkspaceManager, {
      props: { open: true },
      global: { stubs: commonStubs },
    });
    expect(wrapper.text()).toContain("可恢复");
    expect(wrapper.text()).toContain("清理失败");
    expect(wrapper.text()).not.toContain("cleanup-failed");
    expect(wrapper.text()).toContain("恢复");
    expect(wrapper.text()).toContain("重试清理");
    const retry = wrapper.findAll("button").find((button) => button.text().includes("重试清理"));
    await retry?.trigger("click");
    await flushPromises();
    expect(mocks.permanentlyDeleteWorkspace).toHaveBeenCalledWith("failed");
  });
});
