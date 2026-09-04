import type {
  WorkflowProposalDetail,
  WorkflowProposalMode,
  WorkflowProposalStatus,
  WorkflowProposalSummary,
  WorkflowStep,
} from "@shared/types/workflow";

export interface WorkflowProposalStatusPresentation {
  label: string;
  icon: string;
  color: "primary" | "success" | "error" | "warning" | "neutral";
}

const STATUS_PRESENTATION: Record<WorkflowProposalStatus, WorkflowProposalStatusPresentation> = {
  pending: { label: "等待确认", icon: "i-lucide-circle-help", color: "warning" },
  confirming: { label: "正在保存…", icon: "i-lucide-loader-circle", color: "primary" },
  confirmed: { label: "已保存", icon: "i-lucide-circle-check", color: "success" },
  cancelled: { label: "已取消", icon: "i-lucide-circle-slash", color: "neutral" },
};

export function workflowProposalStatusPresentation(
  status: WorkflowProposalStatus
): WorkflowProposalStatusPresentation {
  return STATUS_PRESENTATION[status];
}

export function isActionableWorkflowProposal(proposal: WorkflowProposalSummary): boolean {
  return proposal.status === "pending";
}

export function sortWorkflowProposalSummaries(
  proposals: WorkflowProposalSummary[]
): WorkflowProposalSummary[] {
  return [...proposals].sort((left, right) => {
    const actionable =
      Number(isActionableWorkflowProposal(right)) - Number(isActionableWorkflowProposal(left));
    return actionable || right.updatedAt.localeCompare(left.updatedAt);
  });
}

export function workflowProposalActivityStats(proposals: WorkflowProposalSummary[]): {
  total: number;
  pending: number;
} {
  return {
    total: proposals.length,
    pending: proposals.filter(isActionableWorkflowProposal).length,
  };
}

export function isProposalActionableStage(stage: WorkflowStep): boolean {
  if (stage.kind !== "action" || stage.confirm === true) return false;
  return stage.op.type === "exec" || stage.op.type === "webhook";
}

export interface WorkflowProposalStageProjection {
  stage: WorkflowStep;
  actionableWithoutConfirmation: boolean;
}

export interface WorkflowProposalDetailProjection {
  name: string;
  description?: string;
  mode: WorkflowProposalMode;
  status: WorkflowProposalStatus;
  yaml: string;
  stages: WorkflowProposalStageProjection[];
  stageCount: number;
  actionableStageCount: number;
  targetWorkflowId?: string;
  targetWorkflowName?: string;
  handoffDelivered?: boolean;
}

export function projectWorkflowProposalDetail(
  detail: WorkflowProposalDetail
): WorkflowProposalDetailProjection {
  const stages = detail.definition.stages.map((stage) => ({
    stage,
    actionableWithoutConfirmation: isProposalActionableStage(stage),
  }));
  return {
    name: detail.definition.name,
    ...(detail.definition.description ? { description: detail.definition.description } : {}),
    mode: detail.mode,
    status: detail.status,
    yaml: detail.yaml,
    stages,
    stageCount: stages.length,
    actionableStageCount: stages.filter((stage) => stage.actionableWithoutConfirmation).length,
    ...(detail.targetWorkflowId ? { targetWorkflowId: detail.targetWorkflowId } : {}),
    ...(detail.targetWorkflowName ? { targetWorkflowName: detail.targetWorkflowName } : {}),
    ...(detail.handoffDelivered === undefined ? {} : { handoffDelivered: detail.handoffDelivered }),
  };
}
