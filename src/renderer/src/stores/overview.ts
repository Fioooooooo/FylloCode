import { computed, ref } from "vue";
import { defineStore } from "pinia";

export type OverviewChangeStage = "drafting" | "proposal" | "applying";

export interface OverviewStats {
  specsCount: number;
  specsThisMonth: number;
  archiveCount: number;
  archiveThisMonth: number;
  guidelinesCount: number;
  guidelinesLastUpdated: string | null;
  taskDrivenRatio: number;
  totalSubjects: number;
}

export interface ActiveChange {
  changeName: string;
  createdAt: string | null;
  taskTitle: string | null;
  taskRef: string | null;
  stage: OverviewChangeStage;
}

export interface RecentThread {
  subjectId: string;
  origin: "task" | "chat";
  taskRef: string | null;
  taskTitle: string | null;
  sessionCount: number;
  proposalCount: number;
  mergeCommitSha: string | null;
  mergeCommitUrl: string | null;
  mergeStatus: "merged" | "applying" | "pending";
  createdAt: string;
  updatedAt: string;
}

export interface SpecsGrowthBucket {
  weekStart: string;
  cumulativeCount: number;
}

export interface GuidelineChange {
  fileName: string;
  lastCommitDate: string;
  lastCommitMessage: string;
}

export interface GovernanceEvolution {
  specsGrowth: SpecsGrowthBucket[];
  recentGuidelines: GuidelineChange[];
}

export interface ProjectOverview {
  stats: OverviewStats;
  activeChanges: ActiveChange[];
  recentThreads: RecentThread[];
  governance: GovernanceEvolution;
}

function isoDaysAgo(days: number): string {
  const date = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return date.toISOString();
}

function isoHoursAgo(hours: number): string {
  const date = new Date(Date.now() - hours * 60 * 60 * 1000);
  return date.toISOString();
}

function createMockOverview(): ProjectOverview {
  return {
    stats: {
      specsCount: 74,
      specsThisMonth: 8,
      archiveCount: 110,
      archiveThisMonth: 14,
      guidelinesCount: 10,
      guidelinesLastUpdated: isoDaysAgo(2),
      taskDrivenRatio: 0.68,
      totalSubjects: 38,
    },
    activeChanges: [
      {
        changeName: "add-project-overview-static-mock",
        createdAt: isoHoursAgo(5),
        taskTitle: "项目概览页前端预览",
        taskRef: "LOCAL-128",
        stage: "proposal",
      },
      {
        changeName: "tighten-lineage-proposal-links",
        createdAt: isoDaysAgo(1),
        taskTitle: "补齐对话到提案的线索挂边",
        taskRef: "STORY-42",
        stage: "applying",
      },
      {
        changeName: "refresh-guidelines-index",
        createdAt: isoDaysAgo(3),
        taskTitle: null,
        taskRef: null,
        stage: "drafting",
      },
    ],
    recentThreads: [
      {
        subjectId: "subject-task-1",
        origin: "task",
        taskRef: "STORY-42",
        taskTitle: "重构登录流程的提案链路",
        sessionCount: 2,
        proposalCount: 3,
        mergeCommitSha: "a3f21bc9d4",
        mergeCommitUrl: "https://github.com/fyllocode/fyllocode/commit/a3f21bc9d4",
        mergeStatus: "merged",
        createdAt: isoDaysAgo(8),
        updatedAt: isoHoursAgo(3),
      },
      {
        subjectId: "subject-chat-1",
        origin: "chat",
        taskRef: null,
        taskTitle: null,
        sessionCount: 1,
        proposalCount: 1,
        mergeCommitSha: null,
        mergeCommitUrl: null,
        mergeStatus: "applying",
        createdAt: isoDaysAgo(2),
        updatedAt: isoDaysAgo(1),
      },
      {
        subjectId: "subject-task-2",
        origin: "task",
        taskRef: "LOCAL-91",
        taskTitle: "优化归档失败恢复提示",
        sessionCount: 3,
        proposalCount: 2,
        mergeCommitSha: null,
        mergeCommitUrl: null,
        mergeStatus: "pending",
        createdAt: isoDaysAgo(12),
        updatedAt: isoDaysAgo(4),
      },
    ],
    governance: {
      specsGrowth: [
        { weekStart: isoDaysAgo(49), cumulativeCount: 42 },
        { weekStart: isoDaysAgo(42), cumulativeCount: 47 },
        { weekStart: isoDaysAgo(35), cumulativeCount: 51 },
        { weekStart: isoDaysAgo(28), cumulativeCount: 57 },
        { weekStart: isoDaysAgo(21), cumulativeCount: 63 },
        { weekStart: isoDaysAgo(14), cumulativeCount: 68 },
        { weekStart: isoDaysAgo(7), cumulativeCount: 72 },
        { weekStart: isoDaysAgo(0), cumulativeCount: 74 },
      ],
      recentGuidelines: [
        {
          fileName: "DataModel.md",
          lastCommitDate: isoDaysAgo(1),
          lastCommitMessage: "docs(data): document lineage subject storage",
        },
        {
          fileName: "IPC.md",
          lastCommitDate: isoDaysAgo(2),
          lastCommitMessage: "docs(ipc): clarify lineage proposal event bridge",
        },
        {
          fileName: "RendererProcess.md",
          lastCommitDate: isoDaysAgo(4),
          lastCommitMessage: "docs(renderer): align stores and page ownership",
        },
        {
          fileName: "MainProcess.md",
          lastCommitDate: isoDaysAgo(6),
          lastCommitMessage: "docs(main): add process cleanup constraints",
        },
        {
          fileName: "Testing.md",
          lastCommitDate: isoDaysAgo(9),
          lastCommitMessage: "docs(test): keep renderer mock guidance current",
        },
      ],
    },
  };
}

export const useOverviewStore = defineStore("overview", () => {
  const data = ref<ProjectOverview>(createMockOverview());
  const loading = ref(false);
  const error = ref<string | null>(null);

  const hasActiveChanges = computed(() => data.value.activeChanges.length > 0);
  const hasGovernanceData = computed(
    () =>
      data.value.governance.specsGrowth.length > 0 ||
      data.value.governance.recentGuidelines.length > 0
  );

  function loadMockData(): void {
    loading.value = false;
    error.value = null;
    data.value = createMockOverview();
  }

  function clear(): void {
    error.value = null;
  }

  return {
    data,
    loading,
    error,
    hasActiveChanges,
    hasGovernanceData,
    loadMockData,
    clear,
  };
});
