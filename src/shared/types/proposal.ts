import type { RepositoryAggregate } from "./repository-browser";

export type ProposalStatus = "creating" | "draft" | "applying" | "archived";

export interface ProposalRef {
  folderId: string;
  changeId: string;
}

export type ProposalWorktreeMode = "main" | "linked";

export interface ResolvedProposalTarget {
  proposalRef: ProposalRef;
  worktreeMode: ProposalWorktreeMode;
  worktreePath: string;
}

export function proposalRefKey(proposalRef: ProposalRef): string {
  return `${proposalRef.folderId}\0${proposalRef.changeId}`;
}

export interface ProposalMeta {
  /** Display-compatible change ID; ProposalRef remains the complete identity. */
  id: string;
  proposalRef: ProposalRef;
  folderName: string;
  title: string;
  status: ProposalStatus;
  why: string;
  totalTasks: number;
  doneTasks: number;
  hasDesign: boolean;
  date: string;
  worktreeMode: ProposalWorktreeMode;
  worktreePath: string;
}

export type ProposalBrowserOverview = RepositoryAggregate<ProposalMeta>;

export type ProposalSpecDeltaType = "ADDED" | "MODIFIED" | "REMOVED" | "RENAMED";

export type ProposalSpecDeltaScenarioGroup = {
  title: string;
  body: string;
};

export type ProposalSpecDeltaRequirementGroup = {
  deltaType: ProposalSpecDeltaType;
  title: string;
  body: string;
  scenarios: ProposalSpecDeltaScenarioGroup[];
};

export type ProposalSpecDeltaItem = {
  id: string;
  purpose: string;
  sourcePath: string;
  deltaTypes: ProposalSpecDeltaType[];
  requirementsCount: number;
  scenariosCount: number;
  requirementGroups: ProposalSpecDeltaRequirementGroup[];
};

export type ProposalSpecDeltaOverview = {
  items: ProposalSpecDeltaItem[];
};

export type ProposalStatusChangedPayload = {
  workspaceId: string;
  proposalRef: ProposalRef;
  sessionId: string;
  status: ProposalStatus;
  changeKind: "status" | "tasks";
  updatedAt: string;
  removed?: boolean;
};
