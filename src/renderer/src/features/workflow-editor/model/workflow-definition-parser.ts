import { load } from "js-yaml";
import type { WorkflowDefinition, WorkflowStep, WorkflowTransition } from "@shared/types/workflow";

export interface WorkflowGraphParseResult {
  definition: WorkflowDefinition | null;
  error: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertDefinition(value: unknown): WorkflowDefinition {
  if (!isRecord(value)) throw new Error("Workflow definition 必须是对象");
  if (value.version !== 2) throw new Error("Workflow definition version 必须是 2");
  if (typeof value.name !== "string" || value.name.trim() === "") {
    throw new Error("Workflow definition 缺少 name");
  }
  if (!Array.isArray(value.stages) || value.stages.length === 0) {
    throw new Error("Workflow definition 至少需要一个 stage");
  }

  const stageIds = new Set<string>();
  for (const stage of value.stages) {
    if (!isRecord(stage)) throw new Error("Workflow stage 必须是对象");
    if (typeof stage.id !== "string" || stage.id.trim() === "") {
      throw new Error("Workflow stage 缺少 id");
    }
    if (stageIds.has(stage.id)) throw new Error(`Workflow stage id 重复：${stage.id}`);
    stageIds.add(stage.id);
    if (stage.kind !== "agent" && stage.kind !== "action" && stage.kind !== "wait") {
      throw new Error(`Workflow stage kind 无效：${String(stage.kind)}`);
    }
    if (stage.next !== undefined && !Array.isArray(stage.next)) {
      throw new Error(`Workflow stage ${stage.id} 的 next 必须是数组`);
    }
  }

  for (const stage of value.stages) {
    const next = (stage as Record<string, unknown>).next;
    if (!Array.isArray(next)) continue;
    for (const transition of next) {
      if (!isRecord(transition)) throw new Error(`Workflow stage ${stage.id} 的 transition 无效`);
      if (
        (transition.on !== "pass" && transition.on !== "fail" && transition.on !== "signal") ||
        typeof transition.goto !== "string" ||
        !stageIds.has(transition.goto)
      ) {
        throw new Error(`Workflow stage ${stage.id} 的 transition 引用无效`);
      }
    }
  }

  return value as unknown as WorkflowDefinition;
}

export function parseWorkflowDefinitionForGraph(yaml: string): WorkflowGraphParseResult {
  try {
    return { definition: assertDefinition(load(yaml)), error: null };
  } catch (error: unknown) {
    return {
      definition: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function isWorkflowStep(value: unknown): value is WorkflowStep {
  return isRecord(value) && typeof value.id === "string" && typeof value.kind === "string";
}

export function isWorkflowTransition(value: unknown): value is WorkflowTransition {
  return (
    isRecord(value) &&
    (value.on === "pass" || value.on === "fail" || value.on === "signal") &&
    typeof value.goto === "string"
  );
}
