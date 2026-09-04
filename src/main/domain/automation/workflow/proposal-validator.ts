import type {
  WorkflowProposalMode,
  WorkflowProposalPersist,
  WorkflowDefinition,
} from "@shared/types/workflow";
import { parseWorkflowYaml, WorkflowDefinitionValidationError } from "./yaml-parser";

export interface ValidateProposeWorkflowInput {
  yaml: string;
  mode: WorkflowProposalMode | string;
  workflowId?: string;
  persist: WorkflowProposalPersist | string;
}

export interface WorkflowProposalValidationContext {
  sessionDefinition?: unknown | null;
  workspaceDefinition?: unknown | null;
  sessionWorkflowExists?: boolean;
  workspaceWorkflowExists?: boolean;
}

export interface WorkflowProposalValidationError {
  rule: string;
  detail: string;
}

export type WorkflowProposalValidationResult =
  | { ok: true; definition: WorkflowDefinition }
  | { ok: false; errors: WorkflowProposalValidationError[] };

function hasExistingDefinition(
  context: WorkflowProposalValidationContext,
  scope: "session" | "workspace"
): boolean {
  const explicit =
    scope === "session" ? context.sessionWorkflowExists : context.workspaceWorkflowExists;
  if (explicit !== undefined) return explicit;
  return (scope === "session" ? context.sessionDefinition : context.workspaceDefinition) != null;
}

function parserErrors(error: WorkflowDefinitionValidationError): WorkflowProposalValidationError[] {
  return error.issues.map((issue) => ({
    rule: issue.feature ?? issue.field ?? "schema",
    detail: issue.message,
  }));
}

/**
 * 仅检查 proposal 的定义态契约；运行能力由 Workflow Engine 在 trigger 阶段单独预检。
 */
export function validateProposeWorkflowInput(
  input: ValidateProposeWorkflowInput,
  context: WorkflowProposalValidationContext = {}
): WorkflowProposalValidationResult {
  const errors: WorkflowProposalValidationError[] = [];
  if (input.persist !== "session" && input.persist !== "workspace") {
    errors.push({ rule: "persist", detail: "persist 必须是 session 或 workspace" });
  }
  if (input.mode !== "create" && input.mode !== "update") {
    errors.push({ rule: "mode", detail: "mode 必须是 create 或 update" });
  } else if (input.mode === "create" && input.workflowId !== undefined) {
    errors.push({ rule: "mode-workflow-id", detail: "mode:create 不得提供 workflowId" });
  } else if (input.mode === "update") {
    if (!input.workflowId) {
      errors.push({ rule: "mode-workflow-id", detail: "mode:update 必须提供 workflowId" });
    } else if (
      !hasExistingDefinition(context, "session") &&
      !hasExistingDefinition(context, "workspace")
    ) {
      errors.push({
        rule: "workflow-id",
        detail: `目标 Workflow 不存在：${input.workflowId}`,
      });
    }
  }

  let definition: WorkflowDefinition | undefined;
  try {
    definition = parseWorkflowYaml(input.yaml);
  } catch (error: unknown) {
    if (error instanceof WorkflowDefinitionValidationError) {
      errors.push(...parserErrors(error));
    } else {
      errors.push({
        rule: "schema",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return errors.length > 0 || !definition ? { ok: false, errors } : { ok: true, definition };
}
