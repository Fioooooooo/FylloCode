import type {
  WorkflowRunDetail,
  WorkflowRunStatus,
  WorkflowRunSummary,
} from "@shared/types/workflow";

export interface WorkflowRunStatusPresentation {
  label: string;
  icon: string;
  color: "primary" | "success" | "error" | "warning" | "neutral";
}

const STATUS_PRESENTATION: Record<WorkflowRunStatus, WorkflowRunStatusPresentation> = {
  awaiting_start_confirmation: {
    label: "等待启动确认",
    icon: "i-lucide-circle-help",
    color: "warning",
  },
  running: { label: "正在运行…", icon: "i-lucide-loader-circle", color: "primary" },
  awaiting_gate_decision: {
    label: "等待 Gate 决策",
    icon: "i-lucide-shield-question",
    color: "warning",
  },
  awaiting_action_confirmation: {
    label: "等待 Action 确认",
    icon: "i-lucide-terminal-square",
    color: "warning",
  },
  succeeded: { label: "已成功", icon: "i-lucide-circle-check", color: "success" },
  failed: { label: "运行失败", icon: "i-lucide-circle-x", color: "error" },
  cancelled: { label: "已取消", icon: "i-lucide-circle-slash", color: "neutral" },
  interrupted: { label: "已中断", icon: "i-lucide-circle-stop", color: "neutral" },
};

export function workflowRunStatusPresentation(
  status: WorkflowRunStatus
): WorkflowRunStatusPresentation {
  return STATUS_PRESENTATION[status];
}

export function isActiveWorkflowRun(run: WorkflowRunSummary): boolean {
  return (
    run.status === "awaiting_start_confirmation" ||
    run.status === "running" ||
    run.status === "awaiting_gate_decision" ||
    run.status === "awaiting_action_confirmation"
  );
}

export function isWorkflowRunTerminal(status: WorkflowRunStatus): boolean {
  return (
    status === "succeeded" ||
    status === "failed" ||
    status === "cancelled" ||
    status === "interrupted"
  );
}

export function sortWorkflowRunSummaries(runs: WorkflowRunSummary[]): WorkflowRunSummary[] {
  return [...runs].sort((left, right) => {
    const active = Number(isActiveWorkflowRun(right)) - Number(isActiveWorkflowRun(left));
    return active || right.updatedAt.localeCompare(left.updatedAt);
  });
}

export function workflowRunActivityStats(runs: WorkflowRunSummary[]): {
  total: number;
  active: number;
  awaiting: number;
} {
  return {
    total: runs.length,
    active: runs.filter(isActiveWorkflowRun).length,
    awaiting: runs.filter((run) => run.pendingDecision !== undefined).length,
  };
}

export interface WorkflowRunDetailProjection {
  status: WorkflowRunStatus;
  currentStageId: string;
  pendingDecision?: WorkflowRunDetail["pendingDecision"];
  error?: WorkflowRunDetail["error"];
  artifactCount: number;
  artifactIds: string[];
  hasFreshSession: boolean;
  transcript: string;
}

export function projectWorkflowRunDetail(detail: WorkflowRunDetail): WorkflowRunDetailProjection {
  return {
    status: detail.status,
    currentStageId: detail.currentStageId,
    ...(detail.pendingDecision ? { pendingDecision: detail.pendingDecision } : {}),
    ...(detail.error ? { error: detail.error } : {}),
    artifactCount: Object.keys(detail.artifacts).length,
    artifactIds: Object.keys(detail.artifacts),
    hasFreshSession: detail.agentSessionState !== undefined,
    transcript: detail.transcript ?? "",
  };
}
