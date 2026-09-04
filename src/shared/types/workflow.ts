/**
 * Workflow v2 的定义态与运行态共享契约。
 *
 * 定义态保持完整 schema 的表达能力，Phase 1 是否能够执行由 Main 的
 * capability preflight 决定；这样编辑器可以保存合法但尚未实现的定义。
 */

export type WorkflowContextKind = "proposal" | "plan" | "task" | "chat";

export type WorkflowArtifactSchema = "diff" | "verdict" | "plan" | "test-report" | "freeform";

export interface WorkflowArtifactSpec {
  id: string;
  schema: WorkflowArtifactSchema;
}

/** 已写入 Run 的 artifact，value 的具体形状由 schema 决定。 */
export interface WorkflowArtifact {
  id: string;
  schema: WorkflowArtifactSchema;
  value: unknown;
}

export type WorkflowSeverity = "low" | "medium" | "high";

export type WorkflowSignalKind = "check-result" | "review-decision" | "manual";

export type WorkflowGate =
  | { type: "expr"; expr: string }
  | { type: "verdict"; maxSeverity: WorkflowSeverity }
  | { type: "human"; prompt: string };

export type WorkflowActionOp =
  | { type: "git.branch"; name: string }
  | { type: "git.commit"; message: string }
  | { type: "scm.open-pr"; title: string; body?: string; base: string }
  | { type: "tracker.transition"; to: string }
  | { type: "tracker.comment"; body: string }
  | { type: "exec"; command: string; cwd?: string }
  | { type: "webhook"; url: string; method?: "POST" | "PUT"; body: string };

export type WorkflowTransition = {
  on: "pass" | "fail" | "signal";
  goto: string;
  maxLoops?: number;
};

export interface WorkflowStepBase {
  id: string;
  name?: string;
  next?: WorkflowTransition[];
  terminal?: boolean;
}

export type WorkflowAgentStep = WorkflowStepBase & {
  kind: "agent";
  agent?: string;
  context?: "inherit" | "fresh";
  prompt: string;
  produces: WorkflowArtifactSpec;
  gate?: WorkflowGate;
  mcp?: string[];
  skills?: string[];
};

export type WorkflowActionStep = WorkflowStepBase & {
  kind: "action";
  op: WorkflowActionOp;
  confirm?: boolean;
  idempotencyKey?: string;
  retry?: { max: number; backoffMs: number };
};

export type WorkflowWaitStep = WorkflowStepBase & {
  kind: "wait";
  for: WorkflowSignalKind;
  timeoutMs?: number;
  onTimeout?: "fail" | "continue" | "ask";
};

export type WorkflowStep = WorkflowAgentStep | WorkflowActionStep | WorkflowWaitStep;

export interface WorkflowDefinition {
  name: string;
  version: 2;
  description?: string;
  requires?: readonly WorkflowContextKind[];
  confirmStart?: boolean;
  stages: WorkflowStep[];
}

export type WorkflowRunStatus =
  | "awaiting_start_confirmation"
  | "running"
  | "awaiting_gate_decision"
  | "awaiting_action_confirmation"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "interrupted";

export type WorkflowDecisionKind = "start" | "gate" | "action";

export interface WorkflowPendingDecision {
  kind: WorkflowDecisionKind;
  prompt: string;
  stageId?: string;
}

export interface WorkflowAgentSessionState {
  sessionId: string;
  acpSessionId?: string;
}

export interface WorkflowActionState {
  stageId: string;
  logPath: string;
  startedAt?: string;
  endedAt?: string;
  exitCode?: number;
  signal?: string;
}

export interface WorkflowRunError {
  code: string;
  message: string;
  stageId?: string;
  feature?: string;
  refs?: string[];
}

export interface WorkflowRunSnapshot {
  snapshotSchemaVersion: 1;
  runId: string;
  workflowId: string;
  parentSessionId: string;
  frozenDefinition: WorkflowDefinition;
  definitionSource?: "session" | "workspace";
  status: WorkflowRunStatus;
  currentStageId: string;
  visitCounts: Record<string, number>;
  artifacts: Record<string, unknown>;
  pendingDecision?: WorkflowPendingDecision;
  agentSessionState?: WorkflowAgentSessionState;
  actionState?: WorkflowActionState;
  error?: WorkflowRunError;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowDefinitionSummary {
  workflowId: string;
  name: string;
  description?: string;
}

export interface WorkflowDefinitionRecord extends WorkflowDefinitionSummary {
  yaml: string;
  definition: WorkflowDefinition;
}

export interface WorkflowListRequest {
  workspaceId: string;
}

export interface WorkflowSaveRequest {
  workspaceId: string;
  workflowId?: string;
  yaml: string;
}

export interface WorkflowDeleteRequest {
  workspaceId: string;
  workflowId: string;
}

export interface WorkflowListResult {
  workflows: WorkflowDefinitionRecord[];
}

export type WorkflowSaveResult = WorkflowDefinitionRecord;

export interface WorkflowRunSummary {
  runId: string;
  workflowId: string;
  workflowName: string;
  parentSessionId: string;
  status: WorkflowRunStatus;
  currentStageId: string;
  pendingDecision?: WorkflowPendingDecision;
  error?: WorkflowRunError;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowRunDetail extends WorkflowRunSummary {
  visitCounts: Record<string, number>;
  artifacts: Record<string, unknown>;
  agentSessionState?: WorkflowAgentSessionState;
  actionState?: WorkflowActionState;
  transcript?: string;
}

export interface WorkflowRunListRequest {
  workspaceId: string;
  parentSessionId: string;
}

export interface WorkflowRunDetailRequest extends WorkflowRunListRequest {
  runId: string;
}

export interface WorkflowRunDecisionRequest extends WorkflowRunDetailRequest {
  decision: "approve" | "reject";
}

export interface WorkflowRunWakePayload {
  workspaceId: string;
  runId: string;
}

export interface WorkflowRunListResult {
  runs: WorkflowRunSummary[];
}

export type WorkflowProposalMode = "create" | "update";

export type WorkflowProposalPersist = "session" | "workspace";

export type WorkflowProposalStatus = "pending" | "confirming" | "confirmed" | "cancelled";

export interface WorkflowProposalSummary {
  proposalId: string;
  workspaceId: string;
  parentSessionId: string;
  mode: WorkflowProposalMode;
  targetWorkflowId?: string;
  suggestedPersist: WorkflowProposalPersist;
  status: WorkflowProposalStatus;
  handoffDelivered?: boolean;
  resolvedWorkflowId?: string;
  resolvedPersist?: WorkflowProposalPersist;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowProposalDetail extends WorkflowProposalSummary {
  yaml: string;
  definition: WorkflowDefinition;
  targetWorkflowName?: string;
}

export interface WorkflowProposalListRequest {
  workspaceId: string;
  parentSessionId: string;
}

export interface WorkflowProposalDetailRequest extends WorkflowProposalListRequest {
  proposalId: string;
}

export interface WorkflowProposalConfirmRequest extends WorkflowProposalDetailRequest {
  persist: WorkflowProposalPersist;
}

export interface WorkflowProposalConfirmDispatchRequest extends WorkflowProposalConfirmRequest {
  streamId: string;
}

export type WorkflowProposalCancelRequest = WorkflowProposalDetailRequest;

export interface WorkflowProposalWakePayload {
  workspaceId: string;
  parentSessionId: string;
  proposalId: string;
}

export type WorkflowProposalConfirmResult =
  | {
      status: "confirmed";
      workflowId: string;
      persist: WorkflowProposalPersist;
    }
  | {
      status: "cancelled";
    };

export type WorkflowProposalConfirmDispatchResult =
  | {
      status: "accepted";
      result: WorkflowProposalConfirmResult;
    }
  | {
      status: "not_pending" | "busy";
    };

export type WorkflowProposalCancelResult =
  | { status: "cancelled" }
  | { status: "confirmed"; workflowId: string; persist: WorkflowProposalPersist };

export interface WorkflowProposalListResult {
  proposals: WorkflowProposalSummary[];
}

export type WorkflowDecisionNotificationState =
  "pending" | "dispatched" | "delivered" | "delivery_unknown" | "suppressed";

export interface WorkflowProposalDecisionSummary {
  notificationId: string;
  parentSessionId: string;
  proposalId: string;
  decision: "cancelled";
  state: WorkflowDecisionNotificationState;
  decidedAt: string;
  updatedAt: string;
}

export interface WorkflowProposalDecisionListResult {
  decisions: WorkflowProposalDecisionSummary[];
}

export type WorkflowProposalDecisionDispatchResult =
  { status: "accepted" } | { status: "not_pending" | "busy" };
