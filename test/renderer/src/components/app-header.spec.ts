import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import AppHeader from "@renderer/components/layout/AppHeader.vue";

const routeMocks = vi.hoisted(() => ({
  goToDefault: vi.fn(),
}));

const projectStoreMock = vi.hoisted(() => ({
  currentProject: { name: "FylloCode" },
  recentProjects: [] as Array<{
    id: string;
    name: string;
    path: string;
    createdAt: Date;
    lastOpenedAt: Date;
    pathMissing?: boolean;
  }>,
  openFolderWindow: vi.fn(),
  openProjectWindow: vi.fn(),
  openRecentProject: vi.fn(),
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

vi.mock("@renderer/stores/workspace/project", () => ({
  useProjectStore: () => projectStoreMock,
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
    projectStoreMock.recentProjects = [];
    projectStoreMock.openFolderWindow.mockResolvedValue(null);
    projectStoreMock.openProjectWindow.mockResolvedValue(null);
    projectStoreMock.openRecentProject.mockResolvedValue(null);
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
      id: "project-b",
      name: "Project B",
      path: "/tmp/project-b",
      createdAt: new Date("2026-07-06T00:00:00.000Z"),
      lastOpenedAt: new Date("2026-07-07T00:00:00.000Z"),
    };
    projectStoreMock.recentProjects = [project];
    const wrapper = mountAppHeader();

    await wrapper.get('[data-test="dropdown-item-Project B"]').trigger("click");
    await flushPromises();

    expect(projectStoreMock.openRecentProject).toHaveBeenCalledWith(project);
    expect(projectStoreMock.openProjectWindow).not.toHaveBeenCalled();
  });

  it("routes missing-path recent projects through openRecentProject without direct window open", async () => {
    const project = {
      id: "project-missing",
      name: "Missing Project",
      path: "/tmp/missing",
      createdAt: new Date("2026-07-06T00:00:00.000Z"),
      lastOpenedAt: new Date("2026-07-07T00:00:00.000Z"),
      pathMissing: true,
    };
    projectStoreMock.recentProjects = [project];
    const wrapper = mountAppHeader();

    await wrapper.get('[data-test="dropdown-item-Missing Project"]').trigger("click");
    await flushPromises();

    expect(projectStoreMock.openRecentProject).toHaveBeenCalledWith(project);
    expect(projectStoreMock.openProjectWindow).not.toHaveBeenCalled();
  });

  it("navigates only when opening a folder binds the current window", async () => {
    projectStoreMock.openFolderWindow.mockResolvedValueOnce({
      id: "project-a",
      name: "Project A",
      path: "/tmp/project-a",
      metaPath: "/tmp/project-a/meta.json",
      createdAt: new Date("2026-07-06T00:00:00.000Z"),
      lastOpenedAt: new Date("2026-07-07T00:00:00.000Z"),
    });
    const wrapper = mountAppHeader();

    await wrapper.get('[data-test="dropdown-item-打开项目"]').trigger("click");
    await flushPromises();

    expect(projectStoreMock.openFolderWindow).toHaveBeenCalled();
    expect(routeMocks.goToDefault).toHaveBeenCalled();
  });
});
