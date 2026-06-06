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
