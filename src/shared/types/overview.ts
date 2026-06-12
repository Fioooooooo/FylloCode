export type OverviewChangeStage = "drafting" | "proposal" | "applying";

export type OverviewStats = {
  specsCount: number;
  specsThisMonth: number;
  archiveCount: number;
  archiveThisMonth: number;
  guidelinesCount: number;
  guidelinesLastUpdated: string | null;
  taskLinkedRatio: number;
  totalSubjects: number;
};

export type ActiveChange = {
  changeName: string;
  createdAt: string | null;
  taskTitle: string | null;
  taskRef: string | null;
  stage: OverviewChangeStage;
};

export type RecentThread = {
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
};

export type SpecsGrowthBucket = {
  weekStart: string;
  cumulativeCount: number;
};

export type GuidelineChange = {
  fileName: string;
  lastCommitDate: string;
  lastCommitMessage: string;
};

export type GovernanceEvolution = {
  specsGrowth: SpecsGrowthBucket[];
  recentGuidelines: GuidelineChange[];
};

export type ProjectOverview = {
  stats: OverviewStats;
  activeChanges: ActiveChange[];
  recentThreads: RecentThread[];
  governance: GovernanceEvolution;
};
