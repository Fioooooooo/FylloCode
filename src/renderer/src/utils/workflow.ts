import { load } from "js-yaml";
import type { WorkflowStage, WorkflowStageType } from "@shared/types/workflow";

export type RawWorkflow = {
  name?: unknown;
  description?: unknown;
  version?: unknown;
  stages?: unknown;
};

export type RawStage = {
  id?: unknown;
  name?: unknown;
  type?: unknown;
  agent?: unknown;
  prompt?: unknown;
  when?: unknown;
  onFailure?: unknown;
  mcp?: unknown;
  skills?: unknown;
};

export type ParsedWorkflow = {
  name: string;
  description: string;
  version: string;
  stages: WorkflowStage[];
};

const workflowStageTypes = new Set<WorkflowStageType>([
  "proposal-apply",
  "proposal-archive",
  "code-review",
  "security-check",
  "create-pr",
  "custom",
]);

export function toStringValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return undefined;
}

export function toStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.map((item) => toStringValue(item)).filter((item): item is string => Boolean(item));
}

export function parseStageType(value: unknown): WorkflowStageType {
  if (typeof value === "string" && workflowStageTypes.has(value as WorkflowStageType)) {
    return value as WorkflowStageType;
  }

  if (value === "apply") {
    return "proposal-apply";
  }

  if (value === "archive") {
    return "proposal-archive";
  }

  return "custom";
}

export function parseWorkflowYaml(source: string, fallbackName = "新工作流"): ParsedWorkflow {
  try {
    const document = load(source) as RawWorkflow | null;

    if (!document || typeof document !== "object" || Array.isArray(document)) {
      return {
        name: fallbackName,
        description: "暂无描述",
        version: "1",
        stages: [],
      };
    }

    const stages = Array.isArray(document.stages)
      ? document.stages
          .filter((stage): stage is RawStage => typeof stage === "object" && stage !== null)
          .map((stage, index) => {
            const id = toStringValue(stage.id) ?? `stage-${index + 1}`;
            return {
              id,
              name: toStringValue(stage.name) ?? id,
              type: parseStageType(stage.type),
              agent: toStringValue(stage.agent),
              prompt: toStringValue(stage.prompt),
              when: toStringValue(stage.when),
              onFailure: toStringValue(stage.onFailure),
              mcp: toStringList(stage.mcp),
              skills: toStringList(stage.skills),
            };
          })
      : [];

    return {
      name: toStringValue(document.name) ?? fallbackName,
      description: toStringValue(document.description) ?? "暂无描述",
      version: toStringValue(document.version) ?? "1",
      stages,
    };
  } catch {
    return {
      name: fallbackName,
      description: "YAML 格式有误",
      version: "1",
      stages: [],
    };
  }
}

export const STAGE_TEMPLATES: Record<WorkflowStageType, WorkflowStage> = {
  "proposal-apply": {
    id: "stage-proposal-apply",
    name: "应用变更",
    type: "proposal-apply",
    prompt: "按照已确认的 proposal 任务实施代码变更。",
  },
  "proposal-archive": {
    id: "stage-proposal-archive",
    name: "归档变更",
    type: "proposal-archive",
    prompt: "整理 apply 结果并完成 proposal 归档。",
  },
  "code-review": {
    id: "stage-code-review",
    name: "代码审查",
    type: "code-review",
    prompt: "审查当前变更的正确性、可维护性与测试覆盖。",
  },
  "security-check": {
    id: "stage-security-check",
    name: "安全检查",
    type: "security-check",
    prompt: "检查依赖、权限、密钥与潜在安全风险。",
  },
  "create-pr": {
    id: "stage-create-pr",
    name: "创建 PR",
    type: "create-pr",
    prompt: "整理变更摘要、测试结果与风险说明并创建 PR。",
  },
  custom: {
    id: "stage-custom",
    name: "自定义阶段",
    type: "custom",
    prompt: "在这里填写自定义阶段的执行说明。",
  },
};
