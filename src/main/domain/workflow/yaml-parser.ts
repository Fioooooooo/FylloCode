import { load } from "js-yaml";
import type { WorkflowStage, WorkflowStageType, WorkflowTemplate } from "@shared/types/workflow";

type RawWorkflow = {
  name?: unknown;
  description?: unknown;
  version?: unknown;
  stages?: unknown;
};

type RawStage = {
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

const workflowStageTypes = new Set<WorkflowStageType>([
  "proposal-apply",
  "proposal-archive",
  "code-review",
  "security-check",
  "create-pr",
  "custom",
]);

function toStringValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return undefined;
}

function toStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.map((item) => toStringValue(item)).filter((item): item is string => Boolean(item));
}

function parseStageType(value: unknown): WorkflowStageType {
  if (typeof value === "string" && workflowStageTypes.has(value as WorkflowStageType)) {
    return value as WorkflowStageType;
  }
  if (value === "apply") return "proposal-apply";
  if (value === "archive") return "proposal-archive";
  return "custom";
}

export function parseWorkflowYaml(
  yaml: string,
  fallbackName: string
): Omit<WorkflowTemplate, "source"> {
  let document: RawWorkflow | null;
  try {
    document = load(yaml) as RawWorkflow | null;
  } catch {
    // 畸形 YAML（语法错误、深度递归等）不应让调用方崩溃；
    // 降级为空文档，按 fallback 产出最小可用模板。
    document = null;
  }
  const rawWorkflow = document && typeof document === "object" ? document : {};
  const rawStages = Array.isArray(rawWorkflow.stages) ? rawWorkflow.stages : [];
  const stages: WorkflowStage[] = rawStages
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
    });

  const name = toStringValue(rawWorkflow.name) ?? fallbackName;
  const rawVersion = rawWorkflow.version;
  const version =
    typeof rawVersion === "number"
      ? rawVersion
      : typeof rawVersion === "string"
        ? Number(rawVersion)
        : undefined;

  return {
    id: fallbackName,
    name,
    description: toStringValue(rawWorkflow.description),
    version: Number.isFinite(version) ? version : undefined,
    yaml,
    stages,
  };
}
