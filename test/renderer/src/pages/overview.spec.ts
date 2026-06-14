import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { overviewApi } from "@renderer/api/overview";
import OverviewPage from "@renderer/pages/overview.vue";
import { useProjectStore } from "@renderer/stores/project";
import type { ProjectOverview } from "@shared/types/overview";
import type { ProjectInfo } from "@shared/types/project";

const routerMock = vi.hoisted(() => ({
  push: vi.fn(),
}));

vi.mock("@renderer/api/overview", () => ({
  overviewApi: {
    getProjectOverview: vi.fn(),
  },
}));

vi.mock("vue-router", () => ({
  useRouter: () => routerMock,
}));

function project(): ProjectInfo {
  return {
    id: "project-1",
    name: "Project 1",
    path: "/tmp/project-1",
    metaPath: "/tmp/project-1.json",
    createdAt: new Date("2026-06-01T00:00:00.000Z"),
    lastOpenedAt: new Date("2026-06-10T00:00:00.000Z"),
  };
}

function overview(): ProjectOverview {
  return {
    stats: {
      specsCount: 74,
      specsThisMonth: 8,
      archiveCount: 110,
      archiveThisMonth: 14,
      guidelinesCount: 10,
      guidelinesLastUpdated: new Date().toISOString(),
      taskLinkedRatio: 0.68,
      totalSubjects: 38,
    },
    activeChanges: [
      {
        id: "add-project-overview-page",
        title: "Add Project Overview Page",
        createdAt: new Date().toISOString(),
        taskTitle: "项目概览页真实数据",
        taskRef: "local:task-1",
        stage: "applying",
      },
    ],
    recentLineages: [
      {
        subjectId: "subject-1",
        origin: "task",
        taskRef: "local:task-1",
        taskTitle: "项目概览页真实数据",
        sessionCount: 2,
        proposalCount: 3,
        mergeCommitSha: null,
        mergeStatus: "applying",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        subjectId: "subject-2",
        origin: "chat",
        taskRef: null,
        taskTitle: null,
        sessionCount: 1,
        proposalCount: 1,
        mergeCommitSha: "abc123archive",
        mergeStatus: "merged",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    governance: {
      specsGrowth: [
        { weekStart: new Date().toISOString(), cumulativeCount: 72 },
        { weekStart: new Date().toISOString(), cumulativeCount: 74 },
      ],
      recentGuidelines: [
        {
          fileName: "IPC.md",
          lastCommitDate: new Date().toISOString(),
          lastCommitMessage: "docs(ipc): document overview channel",
        },
      ],
    },
  };
}

function mountPage() {
  const pinia = createPinia();
  setActivePinia(pinia);
  useProjectStore().currentProject = project();
  return mount(OverviewPage, {
    global: {
      plugins: [pinia],
    },
  });
}

describe("overview page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders loading state while overview data is pending", async () => {
    vi.mocked(overviewApi.getProjectOverview).mockReturnValue(new Promise(() => undefined));

    const wrapper = mountPage();
    await wrapper.vm.$nextTick();

    expect(overviewApi.getProjectOverview).toHaveBeenCalledWith("project-1");
    expect(wrapper.find('[data-test="overview-loading-skeleton"]').exists()).toBe(true);
  });

  it("renders an error state when overview loading fails", async () => {
    vi.mocked(overviewApi.getProjectOverview).mockResolvedValue({
      ok: false,
      error: { code: "UNKNOWN_ERROR", message: "overview failed" },
    });

    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.text()).toContain("overview failed");
  });

  it("renders overview sections from IPC data", async () => {
    vi.mocked(overviewApi.getProjectOverview).mockResolvedValue({
      ok: true,
      data: overview(),
    });

    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.text()).toContain("项目概览");
    expect(wrapper.text()).toContain("实时项目数据");
    expect(wrapper.text()).toContain("74");
    expect(wrapper.text()).toContain("进行中");
    expect(wrapper.text()).toContain("Add Project Overview Page");
    expect(wrapper.text()).toContain("最近脉络");
    expect(wrapper.text()).toContain("abc123a");
    expect(wrapper.text()).toContain("治理演化");
  });

  it("uses the active change title for display and id for navigation", async () => {
    vi.mocked(overviewApi.getProjectOverview).mockResolvedValue({
      ok: true,
      data: overview(),
    });

    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.text()).toContain("Add Project Overview Page");
    expect(wrapper.text()).not.toContain("add-project-overview-page");

    await wrapper.get('[data-test="overview-active-changes"] button').trigger("click");

    expect(routerMock.push).toHaveBeenCalledWith("/proposal/add-project-overview-page");
  });

  it("navigates to proposal list from the archives stat card only", async () => {
    vi.mocked(overviewApi.getProjectOverview).mockResolvedValue({
      ok: true,
      data: overview(),
    });

    const wrapper = mountPage();
    await flushPromises();

    const archivesCard = wrapper.get('[data-test="overview-archives-card"]');
    expect(archivesCard.element.tagName).toBe("BUTTON");

    await archivesCard.trigger("click");
    expect(routerMock.push).toHaveBeenCalledTimes(1);
    expect(routerMock.push).toHaveBeenCalledWith("/proposal");

    routerMock.push.mockClear();
    for (const key of ["specs", "guidelines", "lineages"]) {
      await wrapper.get(`[data-test="overview-stat-card-${key}"]`).trigger("click");
    }

    expect(routerMock.push).not.toHaveBeenCalled();
  });
});
