import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { overviewApi } from "@renderer/api/insight/overview";
import OverviewPage from "@renderer/pages/overview.vue";
import { useProjectStore } from "@renderer/stores/workspace/project";
import { proposalDisplayStatusConfig } from "@renderer/utils/proposal-display-status";
import type { ProjectOverview } from "@shared/types/overview";
import type { ProjectInfo } from "@shared/types/project";

const routerMock = vi.hoisted(() => ({
  push: vi.fn(),
}));

const slideoverMock = vi.hoisted(() => ({
  openProposalDetail: vi.fn(),
}));

vi.mock("@renderer/api/insight/overview", () => ({
  overviewApi: {
    getProjectOverview: vi.fn(),
  },
}));

vi.mock("vue-router", () => ({
  useRouter: () => routerMock,
}));

vi.mock("@renderer/composables/useProposalDetailSlideover", () => ({
  useProposalDetailSlideover: () => slideoverMock,
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
        status: "applying",
        worktreePath: "/tmp/project-1/.worktrees/add-project-overview-page",
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
        archiveCommitHash: null,
        proposalStatus: "applying",
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
        archiveCommitHash: "abc123archive",
        proposalStatus: "completed",
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

  it("renders overview sections from IPC data grouped by dynamic work and governance", async () => {
    vi.mocked(overviewApi.getProjectOverview).mockResolvedValue({
      ok: true,
      data: overview(),
    });

    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.text()).toContain("项目概览");
    expect(wrapper.text()).toContain("实时项目数据");

    const dynamicColumn = wrapper.get('[data-test="overview-dynamic-column"]');
    expect(dynamicColumn.text()).toContain("进行中");
    expect(dynamicColumn.text()).toContain("Add Project Overview Page");
    expect(dynamicColumn.text()).toContain(proposalDisplayStatusConfig.applying.label);
    expect(dynamicColumn.text()).toContain("最近脉络");
    expect(dynamicColumn.text()).toContain("abc123a");
    expect(wrapper.get('[data-test="overview-lineage-timeline"]').classes()).toContain("isolate");
    expect(wrapper.findAll('[data-test="overview-lineage-timeline-node"]')).toHaveLength(2);
    const [taskLineageMeta, chatLineageMeta] = wrapper.findAll(
      '[data-test="overview-lineage-meta"]'
    );
    expect(taskLineageMeta!.text().trim().startsWith("2 sessions")).toBe(true);
    expect(taskLineageMeta!.text()).not.toContain("local:task-1");
    expect(chatLineageMeta!.text().trim().startsWith("1 sessions")).toBe(true);
    expect(chatLineageMeta!.text()).not.toContain("自由讨论");

    const governanceColumn = wrapper.get('[data-test="overview-governance-column"]');
    expect(governanceColumn.text()).toContain("治理健康");
    expect(governanceColumn.text()).toContain("演进追溯覆盖");
    expect(governanceColumn.text()).toContain("基于 38 条项目脉络统计");
    expect(governanceColumn.text()).toContain("能力规约");
    expect(governanceColumn.text()).toContain("归档提案");
    expect(governanceColumn.text()).toContain("项目准则");
    expect(governanceColumn.text()).toContain("规约增长");
    expect(governanceColumn.text()).toContain("准则演化");
    expect(wrapper.find('[data-test="overview-governance-health"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="overview-stat-card-lineages"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="overview-guidelines-card"] [data-icon-name]').exists()).toBe(
      false
    );
    expect(wrapper.find('[data-test="overview-specs-growth"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="overview-guideline-evolution"]').exists()).toBe(true);
  });

  it("uses the active change title for display and id for slideover opening", async () => {
    vi.mocked(overviewApi.getProjectOverview).mockResolvedValue({
      ok: true,
      data: overview(),
    });

    const wrapper = mountPage();
    await flushPromises();

    const activeChanges = wrapper.get('[data-test="overview-active-changes"]');
    expect(activeChanges.text()).toContain("Add Project Overview Page");
    expect(activeChanges.text()).toContain("项目概览页真实数据");
    expect(activeChanges.text()).not.toContain("add-project-overview-page");
    expect(activeChanges.text()).not.toContain("local:task-1");
    expect(activeChanges.find('[data-test="proposal-worktree-badge"]').exists()).toBe(true);
    expect(
      activeChanges
        .find('[aria-label="Linked worktree: /tmp/project-1/.worktrees/add-project-overview-page"]')
        .exists()
    ).toBe(true);
    expect(wrapper.get('[data-test="overview-active-change-meta"]').classes()).toContain(
      "items-end"
    );

    await wrapper.get('[data-test="overview-active-changes"] button').trigger("click");

    expect(slideoverMock.openProposalDetail).toHaveBeenCalledWith("add-project-overview-page");
    expect(routerMock.push).not.toHaveBeenCalled();
  });

  it("navigates from interactive overview stat cards", async () => {
    vi.mocked(overviewApi.getProjectOverview).mockResolvedValue({
      ok: true,
      data: overview(),
    });

    const wrapper = mountPage();
    await flushPromises();

    const specsCard = wrapper.get('[data-test="overview-specs-card"]');
    expect(specsCard.element.tagName).toBe("BUTTON");

    await specsCard.trigger("click");
    expect(routerMock.push).toHaveBeenCalledTimes(1);
    expect(routerMock.push).toHaveBeenCalledWith("/specs");

    routerMock.push.mockClear();

    const archivesCard = wrapper.get('[data-test="overview-archives-card"]');
    expect(archivesCard.element.tagName).toBe("BUTTON");

    await archivesCard.trigger("click");
    expect(routerMock.push).toHaveBeenCalledTimes(1);
    expect(routerMock.push).toHaveBeenCalledWith("/proposal");

    routerMock.push.mockClear();
    const guidelinesCard = wrapper.get('[data-test="overview-guidelines-card"]');
    expect(guidelinesCard.element.tagName).toBe("BUTTON");

    await guidelinesCard.trigger("click");

    expect(routerMock.push).toHaveBeenCalledTimes(1);
    expect(routerMock.push).toHaveBeenCalledWith("/guidelines");
  });
});
