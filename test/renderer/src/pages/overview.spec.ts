import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { overviewApi } from "@renderer/api/insight/overview";
import OverviewPage from "@renderer/pages/overview.vue";
import { useKnowledgeStore } from "@renderer/stores/insight/knowledge";
import { useOverviewStore } from "@renderer/stores/insight/overview";
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

const knowledgeApiMock = vi.hoisted(() => ({
  getBrowser: vi.fn(),
  readEntry: vi.fn(),
  saveEntry: vi.fn(),
  deleteEntry: vi.fn(),
}));

vi.mock("@renderer/api/insight/overview", () => ({
  overviewApi: {
    getProjectOverview: vi.fn(),
  },
}));

vi.mock("@renderer/api/insight/knowledge", () => ({
  knowledgeApi: knowledgeApiMock,
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
    knowledgeApiMock.getBrowser.mockResolvedValue({
      ok: true,
      data: {
        entries: [
          {
            name: "active-entry",
            description: "Active",
            type: "project",
            updatedAt: "2026-07-01T00:00:00.000Z",
            status: "active",
          },
          {
            name: "suspect-entry",
            description: "Suspect",
            type: "project",
            updatedAt: "2026-07-02T00:00:00.000Z",
            status: "suspect",
          },
        ],
        errors: [
          {
            path: "invalid-entry.md",
            name: "invalid-entry",
            type: "parse",
            message: "Invalid input: expected object, received string",
          },
        ],
      },
    });
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
    expect(governanceColumn.text()).toContain("知识沉淀");
    expect(wrapper.get('[data-test="overview-knowledge-value"]').text()).toBe("3");
    expect(wrapper.get('[data-test="overview-knowledge-meta"]').text()).toBe("2 条需关注");
    expect(governanceColumn.text()).toContain("规约增长");
    expect(governanceColumn.text()).toContain("准则演化");
    expect(wrapper.find('[data-test="overview-governance-health"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="overview-stat-card-lineages"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="overview-guidelines-card"] [data-icon-name]').exists()).toBe(
      false
    );
    const governanceEntryGrid = wrapper.get('[data-test="overview-governance-entry-grid"]');
    expect(governanceEntryGrid.classes()).toContain("grid-cols-3");
    expect(governanceEntryGrid.findAll("button")).toHaveLength(4);
    expect(governanceEntryGrid.find('[data-test="overview-knowledge-card"]').exists()).toBe(true);
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

    routerMock.push.mockClear();
    const knowledgeCard = wrapper.get('[data-test="overview-knowledge-card"]');
    expect(knowledgeCard.element.tagName).toBe("BUTTON");

    await knowledgeCard.trigger("click");

    expect(routerMock.push).toHaveBeenCalledTimes(1);
    expect(routerMock.push).toHaveBeenCalledWith("/knowledge");
  });

  it("isolates knowledge loading and failure from successful overview content", async () => {
    vi.mocked(overviewApi.getProjectOverview).mockResolvedValue({ ok: true, data: overview() });
    knowledgeApiMock.getBrowser.mockReturnValueOnce(new Promise(() => undefined));

    const loadingWrapper = mountPage();
    await flushPromises();
    expect(loadingWrapper.text()).toContain("Add Project Overview Page");
    expect(loadingWrapper.get('[data-test="overview-knowledge-card"]').text()).toContain(
      "正在加载…"
    );
    loadingWrapper.unmount();

    knowledgeApiMock.getBrowser.mockResolvedValueOnce({
      ok: false,
      error: { code: "UNKNOWN_ERROR", message: "knowledge failed" },
    });
    const errorWrapper = mountPage();
    await flushPromises();

    expect(errorWrapper.text()).toContain("Add Project Overview Page");
    expect(errorWrapper.get('[data-test="overview-knowledge-card"]').text()).toContain("暂不可用");
    expect(errorWrapper.text()).not.toContain("knowledge failed");
  });

  it("counts scanner errors as knowledge that needs attention", async () => {
    vi.mocked(overviewApi.getProjectOverview).mockResolvedValue({ ok: true, data: overview() });
    knowledgeApiMock.getBrowser.mockResolvedValueOnce({
      ok: true,
      data: {
        entries: [],
        errors: [
          { path: "one.md", name: "one", type: "parse", message: "invalid one" },
          { path: "two.md", name: "two", type: "parse", message: "invalid two" },
          { path: "three.md", name: "three", type: "parse", message: "invalid three" },
        ],
      },
    });

    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.get('[data-test="overview-knowledge-value"]').text()).toBe("3");
    expect(wrapper.get('[data-test="overview-knowledge-meta"]').text()).toBe("3 条需关注");
  });

  it("clears overview and knowledge owner state when the project is removed", async () => {
    vi.mocked(overviewApi.getProjectOverview).mockResolvedValue({ ok: true, data: overview() });
    mountPage();
    await flushPromises();

    const projectStore = useProjectStore();
    const overviewStore = useOverviewStore();
    const knowledgeStore = useKnowledgeStore();
    expect(overviewStore.data).not.toBeNull();
    expect(knowledgeStore.data).not.toBeNull();

    projectStore.currentProject = null;
    await flushPromises();

    expect(overviewStore.data).toBeNull();
    expect(knowledgeStore.data).toBeNull();
  });
});
