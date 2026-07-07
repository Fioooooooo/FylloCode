import type { WorkflowStage } from "./workflow";

export type ProposalStatus = "creating" | "draft" | "applying" | "archived";

export interface ProposalMeta {
  id: string;
  title: string;
  status: ProposalStatus;
  why: string;
  totalTasks: number;
  doneTasks: number;
  hasDesign: boolean;
  date: string;
  worktreePath?: string;
}

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

export interface ApplyRunMeta {
  runId: string;
  changeId: string;
  workflowId: string;
  stages: WorkflowStage[];
  currentStageIndex: number;
  stageAcpSessionIds: Record<number, string>;
  status: "running" | "done" | "error";
  startedAt: string;
  updatedAt: string;
  worktreePath?: string;
}

export interface ArchiveRunMeta {
  runId: string;
  changeId: string;
  status: "running" | "done" | "error";
  startedAt: string;
  updatedAt: string;
  acpSessionId?: string;
}

export type ProposalStatusChangedPayload = {
  projectId: string;
  changeId: string;
  sessionId: string;
  projectPath: string;
  status: ProposalStatus;
  updatedAt: string;
  removed?: boolean;
};
