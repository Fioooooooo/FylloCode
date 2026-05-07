import { promises as fs } from "fs";
import { basename, extname, join } from "path";
import { ipcMain } from "electron";
import { load } from "js-yaml";
import { WorkflowChannels } from "@shared/types/channels";
import type {
  WorkflowDeleteRequest,
  WorkflowListRequest,
  WorkflowListResult,
  WorkflowSaveRequest,
  WorkflowStage,
  WorkflowStageType,
  WorkflowTemplate,
} from "@shared/types/workflow";
import { encodeProjectPath, loadProject } from "@main/services/project-store";
import { getDataSubPath } from "@main/utils/paths";
import { getUserWorkflowDirectory, listBuiltInWorkflowFileNames } from "@main/workflows";
import logger from "@main/utils/logger";
import { wrapHandler } from "./utils";

type WorkflowSource = WorkflowTemplate["source"];

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

function createWorkflowError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

function isWorkflowFile(fileName: string): boolean {
  return fileName.endsWith(".yaml") || fileName.endsWith(".yml");
}

function stripWorkflowExtension(fileName: string): string {
  return fileName.slice(0, fileName.length - extname(fileName).length);
}

function normalizeWorkflowName(name: string): string {
  const trimmedName = name.trim();
  const withoutExtension = stripWorkflowExtension(trimmedName);
  const normalizedName = withoutExtension || trimmedName;

  if (!normalizedName || normalizedName !== basename(normalizedName)) {
    throw createWorkflowError("INVALID_WORKFLOW_NAME", `Invalid workflow name: ${name}`);
  }

  return normalizedName;
}

function toWorkflowFileName(name: string): string {
  return `${normalizeWorkflowName(name)}.yaml`;
}

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

  if (value === "apply") {
    return "proposal-apply";
  }

  if (value === "archive") {
    return "proposal-archive";
  }

  return "custom";
}

function parseWorkflowYaml(yaml: string, fallbackName: string): Omit<WorkflowTemplate, "source"> {
  const document = load(yaml) as RawWorkflow | null;
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

export async function resolveProjectWorkflowDirectory(projectId?: string): Promise<string | null> {
  if (!projectId) {
    return null;
  }

  const project = await loadProject(projectId);
  if (!project) {
    throw createWorkflowError("PROJECT_NOT_FOUND", `Project not found: ${projectId}`);
  }

  return join(getDataSubPath("projects"), encodeProjectPath(project.path), "workflows");
}

export async function readWorkflowDirectory(
  directory: string,
  source: WorkflowSource
): Promise<WorkflowTemplate[]> {
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const templates: WorkflowTemplate[] = [];

    for (const entry of entries) {
      if (!entry.isFile() || !isWorkflowFile(entry.name)) {
        continue;
      }

      const fallbackName = stripWorkflowExtension(entry.name);
      try {
        const yaml = await fs.readFile(join(directory, entry.name), "utf8");
        templates.push({
          ...parseWorkflowYaml(yaml, fallbackName),
          source,
        });
      } catch (error) {
        logger.warn(`[workflow] Failed to read workflow file: ${entry.name}`, error);
      }
    }

    return templates.sort((left, right) => left.name.localeCompare(right.name));
  } catch {
    return [];
  }
}

export function registerWorkflowHandlers(): void {
  ipcMain.handle(WorkflowChannels.list, (_event, request: WorkflowListRequest = {}) =>
    wrapHandler(async (): Promise<WorkflowListResult> => {
      const builtInFileNames = new Set(await listBuiltInWorkflowFileNames());
      const userTemplates = await readWorkflowDirectory(getUserWorkflowDirectory(), "custom");
      const projectWorkflowDirectory = await resolveProjectWorkflowDirectory(request.projectId);
      const projectTemplates = projectWorkflowDirectory
        ? await readWorkflowDirectory(projectWorkflowDirectory, "custom")
        : [];

      const builtInTemplates = userTemplates
        .filter((template) => builtInFileNames.has(toWorkflowFileName(template.id)))
        .map((template) => ({ ...template, source: "built-in" as const }));
      const customUserTemplates = userTemplates.filter(
        (template) => !builtInFileNames.has(toWorkflowFileName(template.id))
      );

      return {
        templates: [...customUserTemplates, ...projectTemplates, ...builtInTemplates],
      };
    })
  );

  ipcMain.handle(WorkflowChannels.save, (_event, request: WorkflowSaveRequest) =>
    wrapHandler(async (): Promise<void> => {
      const directory = await resolveProjectWorkflowDirectory(request.projectId);
      if (!directory) {
        throw createWorkflowError("PROJECT_REQUIRED", "Project is required to save workflow");
      }

      await fs.mkdir(directory, { recursive: true });
      await fs.writeFile(join(directory, toWorkflowFileName(request.name)), request.yaml, "utf8");
    })
  );

  ipcMain.handle(WorkflowChannels.delete, (_event, request: WorkflowDeleteRequest) =>
    wrapHandler(async (): Promise<void> => {
      const builtInFileNames = new Set(await listBuiltInWorkflowFileNames());
      const fileName = toWorkflowFileName(request.name);
      if (builtInFileNames.has(fileName)) {
        throw createWorkflowError("BUILT_IN_WORKFLOW", "Built-in workflow cannot be deleted");
      }

      const directory = await resolveProjectWorkflowDirectory(request.projectId);
      if (!directory) {
        throw createWorkflowError("PROJECT_REQUIRED", "Project is required to delete workflow");
      }

      await fs.rm(join(directory, fileName), { force: true });
    })
  );
}
