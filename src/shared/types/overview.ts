import type { ProposalRef, ProposalStatus } from "./proposal";
import type { RepositoryAggregate } from "./repository-browser";

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
  proposalRef: ProposalRef;
  folderName: string;
  title: string;
  createdAt: string | null;
  taskTitle: string | null;
  taskRef: string | null;
  status: ActiveChangeStatus;
  worktreePath?: string;
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
  folderId: string;
  folderName: string;
  weekStart: string;
  cumulativeCount: number;
};

export type GuidelineChange = {
  folderId: string;
  folderName: string;
  fileName: string;
  lastCommitDate: string;
  lastCommitMessage: string;
};

export type GovernanceEvolution = {
  specsGrowth: SpecsGrowthBucket[];
  recentGuidelines: GuidelineChange[];
};

export type RepositoryGovernanceSnapshot = {
  folderId: string;
  folderName: string;
  stats: Pick<
    OverviewStats,
    | "specsCount"
    | "specsThisMonth"
    | "archiveCount"
    | "archiveThisMonth"
    | "guidelinesCount"
    | "guidelinesLastUpdated"
  >;
  activeChanges: ActiveChange[];
  proposalStatuses: Array<{
    proposalRef: ProposalRef;
    status: ProposalStatus;
  }>;
  governance: GovernanceEvolution;
};

export type ProjectOverview = {
  stats: OverviewStats;
  activeChanges: ActiveChange[];
  recentLineages: RecentLineage[];
  governance: GovernanceEvolution;
  repository: RepositoryAggregate<RepositoryGovernanceSnapshot>;
};
