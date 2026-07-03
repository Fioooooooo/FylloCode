import type { ProposalStatus } from "./proposal";

export type ActiveChangeStatus = Exclude<ProposalStatus, "archived">;

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
  id: string;
  title: string;
  createdAt: string | null;
  taskTitle: string | null;
  taskRef: string | null;
  status: ActiveChangeStatus;
};

export type RecentLineage = {
  subjectId: string;
  origin: "task" | "chat";
  taskRef: string | null;
  taskTitle: string | null;
  sessionCount: number;
  proposalCount: number;
  // Prefer the lineage-persisted proposal commit hash; overview may query Git to fill missing values.
  archiveCommitHash: string | null;
  proposalStatus: "completed" | "applying" | "pending";
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
  recentLineages: RecentLineage[];
  governance: GovernanceEvolution;
};
