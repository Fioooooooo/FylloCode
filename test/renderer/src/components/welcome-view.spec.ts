import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import WelcomeView from "@renderer/components/welcome/WelcomeView.vue";
import type { WorkspaceInfo } from "@shared/types/workspace";
import { workspaceInfo } from "../fixtures/workspace";

const routeMocks = vi.hoisted(() => ({
  goToDefault: vi.fn(),
}));

const workspaceStoreMock = vi.hoisted(() => ({
  recentWorkspaces: [],
  deletedWorkspaces: [],
  openFolderWindow: vi.fn(),
  openWorkspaceWindow: vi.fn(),
  openRecentWorkspace: vi.fn(),
  removeRecentWorkspace: vi.fn(),
}));

vi.mock("@renderer/composables/useDefaultAppRoute", () => ({
  useDefaultAppRoute: () => ({
    goToDefault: routeMocks.goToDefault,
  }),
}));

vi.mock("@renderer/stores/workspace/workspace", () => ({
  useWorkspaceStore: () => workspaceStoreMock,
}));

function projectInfo(id: string) {
  return workspaceInfo({
    id,
    name: `Project ${id}`,
    folderPath: `/tmp/${id}`,
    createdAt: new Date("2026-07-06T00:00:00.000Z"),
    lastOpenedAt: new Date("2026-07-07T00:00:00.000Z"),
  });
}

function mountWelcomeView(
  project: WorkspaceInfo = workspaceInfo({
    id: "project-b",
    name: "Project B",
    folderPath: "/tmp/project-b",
    createdAt: new Date("2026-07-06T00:00:00.000Z"),
    lastOpenedAt: new Date("2026-07-07T00:00:00.000Z"),
  })
) {
  return mount(WelcomeView, {
    global: {
      stubs: {
        WorkspaceList: {
          template:
            '<div><button data-test="recent" @click="$emit(\'open\', project)">recent</button><button data-test="remove" @click="$emit(\'remove\', project)">remove</button></div>',
          emits: ["open", "edit", "create-from-folder", "remove"],
          data: () => ({ project }),
        },
        WorkspaceEditorModal: true,
        DeletedWorkspaceManager: true,
      },
    },
  });
}

describe("WelcomeView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workspaceStoreMock.openFolderWindow.mockResolvedValue(null);
    workspaceStoreMock.openWorkspaceWindow.mockResolvedValue(null);
    workspaceStoreMock.openRecentWorkspace.mockResolvedValue(null);
    workspaceStoreMock.removeRecentWorkspace.mockResolvedValue(undefined);
  });

  it("renders the shared brand icon", () => {
    const wrapper = mountWelcomeView();
    const brandIcon = wrapper.get('[data-test="welcome-brand-icon"]');

    expect(brandIcon.attributes("src")).toContain("icon.svg");
    expect(brandIcon.attributes("alt")).toBe("FylloCode");
    expect(wrapper.text()).toContain("打开 Project");
    expect(wrapper.text()).toContain("创建 Workspace");
    expect(wrapper.text()).toContain("回收站");
  });

  it("navigates after open folder binds the current window", async () => {
    workspaceStoreMock.openFolderWindow.mockResolvedValueOnce(projectInfo("project-a"));
    const wrapper = mountWelcomeView();

    await wrapper.get('[data-icon="i-lucide-folder-open"]').trigger("click");
    await flushPromises();

    expect(workspaceStoreMock.openFolderWindow).toHaveBeenCalled();
    expect(routeMocks.goToDefault).toHaveBeenCalled();
  });

  it("does not navigate when open folder creates or focuses another window", async () => {
    workspaceStoreMock.openFolderWindow.mockResolvedValueOnce(null);
    const wrapper = mountWelcomeView();

    await wrapper.get('[data-icon="i-lucide-folder-open"]').trigger("click");
    await flushPromises();

    expect(workspaceStoreMock.openFolderWindow).toHaveBeenCalled();
    expect(routeMocks.goToDefault).not.toHaveBeenCalled();
  });

  it("opens recent projects through the recent-project store path", async () => {
    workspaceStoreMock.openRecentWorkspace.mockResolvedValueOnce(projectInfo("project-b"));
    const wrapper = mountWelcomeView();

    await wrapper.get('[data-test="recent"]').trigger("click");
    await flushPromises();

    expect(workspaceStoreMock.openRecentWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ id: "project-b" })
    );
    expect(workspaceStoreMock.openWorkspaceWindow).not.toHaveBeenCalled();
    expect(routeMocks.goToDefault).toHaveBeenCalled();
  });

  it("routes missing-path recent projects through openRecentWorkspace without direct window open", async () => {
    const wrapper = mountWelcomeView(
      workspaceInfo({
        id: "project-missing",
        name: "Missing Project",
        folderPath: "/tmp/missing",
        createdAt: new Date("2026-07-06T00:00:00.000Z"),
        lastOpenedAt: new Date("2026-07-07T00:00:00.000Z"),
        pathMissing: true,
      })
    );

    await wrapper.get('[data-test="recent"]').trigger("click");
    await flushPromises();

    expect(workspaceStoreMock.openRecentWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ id: "project-missing", pathMissing: true })
    );
    expect(workspaceStoreMock.openWorkspaceWindow).not.toHaveBeenCalled();
    expect(routeMocks.goToDefault).not.toHaveBeenCalled();
  });
});
