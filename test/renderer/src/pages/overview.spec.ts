import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import OverviewPage from "@renderer/pages/overview.vue";

const loadMockDataMock = vi.fn();
const clearMock = vi.fn();
const pushMock = vi.fn();

const overviewStore = {
  data: {
    stats: {
      specsCount: 74,
      specsThisMonth: 8,
      archiveCount: 110,
      archiveThisMonth: 14,
      guidelinesCount: 10,
      guidelinesLastUpdated: new Date().toISOString(),
      taskDrivenRatio: 0.68,
      totalSubjects: 38,
    },
    activeChanges: [
      {
        changeName: "add-project-overview-static-mock",
        createdAt: new Date().toISOString(),
        taskTitle: "项目概览页前端预览",
        taskRef: "LOCAL-128",
        stage: "proposal",
      },
    ],
    recentThreads: [
      {
        subjectId: "subject-1",
        origin: "task",
        taskRef: "STORY-42",
        taskTitle: "重构登录流程的提案链路",
        sessionCount: 2,
        proposalCount: 3,
        mergeCommitSha: null,
        mergeCommitUrl: null,
        mergeStatus: "pending",
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
          fileName: "DataModel.md",
          lastCommitDate: new Date().toISOString(),
          lastCommitMessage: "docs(data): document overview mock",
        },
      ],
    },
  },
  loading: false,
  error: null,
  hasActiveChanges: true,
  hasGovernanceData: true,
  loadMockData: loadMockDataMock,
  clear: clearMock,
};

const projectStore = {
  currentProject: { id: "project-1" },
};

vi.mock("@renderer/stores/overview", () => ({
  useOverviewStore: () => overviewStore,
}));

vi.mock("@renderer/stores/project", () => ({
  useProjectStore: () => projectStore,
}));

vi.mock("vue-router", () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));

describe("overview page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the static overview sections from mock data", () => {
    const wrapper = mount(OverviewPage);

    expect(loadMockDataMock).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain("项目概览");
    expect(wrapper.text()).toContain("静态预览数据");
    expect(wrapper.text()).toContain("74");
    expect(wrapper.text()).toContain("进行中");
    expect(wrapper.text()).toContain("最近线索");
    expect(wrapper.text()).toContain("治理演化");
  });
});
