import { IpcErrorCodes } from "@shared/constants/error-codes";
import type { WorkflowActionOp, WorkflowDefinition, WorkflowStep } from "@shared/types/workflow";

export type WorkflowCapabilityErrorCode =
  | typeof IpcErrorCodes.WORKFLOW_CONTEXT_UNSUPPORTED
  | typeof IpcErrorCodes.WORKFLOW_FEATURE_NOT_IMPLEMENTED;

export interface WorkflowCapabilityIssue {
  code: WorkflowCapabilityErrorCode;
  message: string;
  field?: string;
  stageId?: string;
  feature?: string;
  refs?: string[];
}

export class WorkflowCapabilityPreflightError extends Error {
  readonly code: WorkflowCapabilityErrorCode;
  readonly issues: WorkflowCapabilityIssue[];
  readonly details: { issues: WorkflowCapabilityIssue[] };

  constructor(issues: WorkflowCapabilityIssue[]) {
    if (issues.length === 0) {
      throw new Error("WorkflowCapabilityPreflightError requires at least one issue");
    }
    super(issues.map((issue) => issue.message).join("；"));
    this.name = "WorkflowCapabilityPreflightError";
    this.code = issues[0].code;
    this.issues = issues;
    this.details = { issues };
  }
}

const freshWorkflowMcpServers = new Set(["fyllo-specs", "fyllo-cortex"]);
const templatePattern = /\{\{\s*([A-Za-z][A-Za-z0-9_-]*)\.([^}|\s]+)(?:\s*\|[^}]*)?\s*\}\}/g;

function addIssue(
  issues: WorkflowCapabilityIssue[],
  code: WorkflowCapabilityErrorCode,
  message: string,
  options: Omit<WorkflowCapabilityIssue, "code" | "message"> = {}
): void {
  issues.push({ code, message, ...options });
}

function addUnsupportedFeature(
  issues: WorkflowCapabilityIssue[],
  feature: string,
  field: string,
  stageId: string,
  refs: string[] = []
): void {
  addIssue(issues, IpcErrorCodes.WORKFLOW_FEATURE_NOT_IMPLEMENTED, `Phase 1 不支持 ${feature}`, {
    field,
    stageId,
    feature,
    ...(refs.length > 0 ? { refs } : {}),
  });
}

function addUnsupportedContext(
  issues: WorkflowCapabilityIssue[],
  feature: string,
  field: string,
  stageId?: string,
  refs: string[] = []
): void {
  addIssue(
    issues,
    IpcErrorCodes.WORKFLOW_CONTEXT_UNSUPPORTED,
    `Phase 1 不支持上下文能力 ${feature}`,
    {
      field,
      ...(stageId ? { stageId } : {}),
      feature,
      ...(refs.length > 0 ? { refs } : {}),
    }
  );
}

function collectTemplateIssues(
  value: string,
  field: string,
  stageId: string,
  issues: WorkflowCapabilityIssue[]
): void {
  for (const match of value.matchAll(templatePattern)) {
    const namespace = match[1];
    if (!namespace || namespace === "run") continue;
    addUnsupportedContext(issues, "template-namespace", field, stageId, [namespace, match[0]]);
  }
}

function collectActionOpTemplateIssues(
  op: WorkflowActionOp,
  field: string,
  stageId: string,
  issues: WorkflowCapabilityIssue[]
): void {
  for (const [key, value] of Object.entries(op)) {
    if (key !== "type" && typeof value === "string") {
      collectTemplateIssues(value, `${field}.${key}`, stageId, issues);
    }
  }
}

function inspectStep(step: WorkflowStep, issues: WorkflowCapabilityIssue[]): void {
  if (step.kind === "agent") {
    collectTemplateIssues(step.prompt, `stages.${step.id}.prompt`, step.id, issues);
    if (step.gate?.type === "human") {
      collectTemplateIssues(step.gate.prompt, `stages.${step.id}.gate.prompt`, step.id, issues);
    }

    if (step.context !== "fresh") {
      addUnsupportedContext(issues, "context.inherit", `stages.${step.id}.context`, step.id, [
        "fresh",
      ]);
    }
    if (step.produces.schema !== "freeform") {
      addUnsupportedFeature(
        issues,
        "structured-artifact",
        `stages.${step.id}.produces.schema`,
        step.id,
        [step.produces.schema]
      );
    }
    if (step.gate?.type === "expr") {
      addUnsupportedFeature(issues, "gate.expr", `stages.${step.id}.gate`, step.id, ["expr"]);
    } else if (step.gate?.type === "verdict") {
      addUnsupportedFeature(issues, "gate.verdict", `stages.${step.id}.gate`, step.id, ["verdict"]);
    }
    for (const serverName of step.mcp ?? []) {
      if (!freshWorkflowMcpServers.has(serverName)) {
        addUnsupportedFeature(issues, "mcp-allowlist", `stages.${step.id}.mcp`, step.id, [
          serverName,
        ]);
      }
    }
    return;
  }

  if (step.kind === "action") {
    collectActionOpTemplateIssues(step.op, `stages.${step.id}.op`, step.id, issues);
    if (step.op.type !== "exec") {
      addUnsupportedFeature(
        issues,
        `action-op.${step.op.type}`,
        `stages.${step.id}.op.type`,
        step.id,
        [step.op.type]
      );
    }
    if (step.retry) {
      addUnsupportedFeature(issues, "retry", `stages.${step.id}.retry`, step.id);
    }
    if (step.idempotencyKey !== undefined) {
      collectTemplateIssues(
        step.idempotencyKey,
        `stages.${step.id}.idempotencyKey`,
        step.id,
        issues
      );
      addUnsupportedFeature(issues, "idempotencyKey", `stages.${step.id}.idempotencyKey`, step.id);
    }
    return;
  }

  addUnsupportedFeature(issues, "wait", `stages.${step.id}.kind`, step.id, ["wait"]);
}

/**
 * 返回整个 definition 的 Phase 1 能力问题；它不改变 definition，也不产生运行副作用。
 */
export function getWorkflowPhase1CapabilityIssues(
  definition: WorkflowDefinition
): WorkflowCapabilityIssue[] {
  const issues: WorkflowCapabilityIssue[] = [];
  for (const context of definition.requires ?? []) {
    addUnsupportedContext(issues, "requires", "requires", undefined, [context]);
  }
  for (const stage of definition.stages) inspectStep(stage, issues);
  return issues;
}

/**
 * 在创建 Run 前执行 Phase 1 capability preflight。
 * 定义态 parser 允许保存未来能力；只有触发执行时才调用此断言。
 */
export function preflightWorkflowDefinition(definition: WorkflowDefinition): void {
  const issues = getWorkflowPhase1CapabilityIssues(definition);
  if (issues.length > 0) throw new WorkflowCapabilityPreflightError(issues);
}
