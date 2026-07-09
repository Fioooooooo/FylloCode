import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import WelcomeView from "@renderer/components/welcome/WelcomeView.vue";
import type { RecentProject } from "@shared/types/project";

const routeMocks = vi.hoisted(() => ({
  goToDefault: vi.fn(),
}));

const projectStoreMock = vi.hoisted(() => ({
  openFolderWindow: vi.fn(),
  openProjectWindow: vi.fn(),
  openRecentProject: vi.fn(),
  removeRecentProject: vi.fn(),
}));

vi.mock("@renderer/composables/useDefaultAppRoute", () => ({
  useDefaultAppRoute: () => ({
    goToDefault: routeMocks.goToDefault,
  }),
}));

vi.mock("@renderer/stores/workspace/project", () => ({
  useProjectStore: () => projectStoreMock,
}));

function projectInfo(id: string) {
  return {
    id,
    name: `Project ${id}`,
    path: `/tmp/${id}`,
    metaPath: `/tmp/${id}/meta.json`,
    createdAt: new Date("2026-07-06T00:00:00.000Z"),
    lastOpenedAt: new Date("2026-07-07T00:00:00.000Z"),
  };
}

function mountWelcomeView(
  project: RecentProject = {
    id: "project-b",
    name: "Project B",
    path: "/tmp/project-b",
    createdAt: new Date("2026-07-06T00:00:00.000Z"),
    lastOpenedAt: new Date("2026-07-07T00:00:00.000Z"),
  }
) {
  return mount(WelcomeView, {
    global: {
      stubs: {
        ProjectList: {
          template:
            '<div><button data-test="recent" @click="$emit(\'open\', project)">recent</button><button data-test="remove" @click="$emit(\'remove\', project.id)">remove</button></div>',
          emits: ["open", "remove"],
          data: () => ({ project }),
        },
      },
    },
  });
}

describe("WelcomeView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    projectStoreMock.openFolderWindow.mockResolvedValue(null);
    projectStoreMock.openProjectWindow.mockResolvedValue(null);
    projectStoreMock.openRecentProject.mockResolvedValue(null);
    projectStoreMock.removeRecentProject.mockResolvedValue(undefined);
  });

  it("navigates after open folder binds the current window", async () => {
    projectStoreMock.openFolderWindow.mockResolvedValueOnce(projectInfo("project-a"));
    const wrapper = mountWelcomeView();

    await wrapper.get('[data-icon="i-lucide-folder-open"]').trigger("click");
    await flushPromises();

    expect(projectStoreMock.openFolderWindow).toHaveBeenCalled();
    expect(routeMocks.goToDefault).toHaveBeenCalled();
  });

  it("does not navigate when open folder creates or focuses another window", async () => {
    projectStoreMock.openFolderWindow.mockResolvedValueOnce(null);
    const wrapper = mountWelcomeView();

    await wrapper.get('[data-icon="i-lucide-folder-open"]').trigger("click");
    await flushPromises();

    expect(projectStoreMock.openFolderWindow).toHaveBeenCalled();
    expect(routeMocks.goToDefault).not.toHaveBeenCalled();
  });

  it("opens recent projects through the recent-project store path", async () => {
    projectStoreMock.openRecentProject.mockResolvedValueOnce(projectInfo("project-b"));
    const wrapper = mountWelcomeView();

    await wrapper.get('[data-test="recent"]').trigger("click");
    await flushPromises();

    expect(projectStoreMock.openRecentProject).toHaveBeenCalledWith(
      expect.objectContaining({ id: "project-b" })
    );
    expect(projectStoreMock.openProjectWindow).not.toHaveBeenCalled();
    expect(routeMocks.goToDefault).toHaveBeenCalled();
  });

  it("routes missing-path recent projects through openRecentProject without direct window open", async () => {
    const wrapper = mountWelcomeView({
      id: "project-missing",
      name: "Missing Project",
      path: "/tmp/missing",
      createdAt: new Date("2026-07-06T00:00:00.000Z"),
      lastOpenedAt: new Date("2026-07-07T00:00:00.000Z"),
      pathMissing: true,
    });

    await wrapper.get('[data-test="recent"]').trigger("click");
    await flushPromises();

    expect(projectStoreMock.openRecentProject).toHaveBeenCalledWith(
      expect.objectContaining({ id: "project-missing", pathMissing: true })
    );
    expect(projectStoreMock.openProjectWindow).not.toHaveBeenCalled();
    expect(routeMocks.goToDefault).not.toHaveBeenCalled();
  });
});
