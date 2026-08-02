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

describe("Workspace launcher lifecycle UI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.recentWorkspaces = [];
    mocks.deletedWorkspaces = [];
    mocks.confirm.mockResolvedValue(true);
  });

  it("renders Folder and Collection identity with missing member details", () => {
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
    expect(wrapper.text()).toContain("Folder");
    expect(wrapper.text()).toContain("Collection");
    expect(wrapper.text()).toContain("1 个缺失");
    expect(wrapper.text()).toContain("/work/missing");
  });

  it("keeps Folder Workspace member controls hidden in edit mode", () => {
    const wrapper = mount(WorkspaceEditorModal, {
      props: { open: true, mode: "edit", workspace: launcher() },
      global: { stubs: commonStubs },
    });
    expect(wrapper.text()).toContain("不能修改成员");
    expect(wrapper.find('[aria-label="移除成员"]').exists()).toBe(false);
    expect(wrapper.find('[aria-label="重新定位"]').exists()).toBe(true);
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
    expect(wrapper.text()).toContain("恢复");
    expect(wrapper.text()).toContain("重试清理");
    const retry = wrapper.findAll("button").find((button) => button.text().includes("重试清理"));
    await retry?.trigger("click");
    await flushPromises();
    expect(mocks.permanentlyDeleteWorkspace).toHaveBeenCalledWith("failed");
  });
});
