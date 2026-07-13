import { promises as fs } from "fs";
import { basename, extname, join } from "path";
import type {
  WorkflowDeleteRequest,
  WorkflowListResult,
  WorkflowSaveRequest,
  WorkflowTemplate,
} from "@shared/types/workflow";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import { loadProject } from "@main/infra/storage/project-store";
import { workflowsDir } from "@main/infra/storage/project-paths";
import {
  getUserWorkflowDirectory,
  listBuiltInWorkflowFileNames,
} from "@main/services/automation/workflow/built-in-loader";
import { parseWorkflowYaml } from "@main/domain/automation/workflow/yaml-parser";
import { ipcError } from "@main/ipc/_kit/errors";
import logger from "@main/infra/logger";

type WorkflowSource = WorkflowTemplate["source"];

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
    throw ipcError(IpcErrorCodes.INVALID_WORKFLOW_NAME, `Invalid workflow name: ${name}`);
  }
  return normalizedName;
}

function toWorkflowFileName(name: string): string {
  return `${normalizeWorkflowName(name)}.yaml`;
}

export async function resolveProjectWorkflowDirectory(projectId?: string): Promise<string | null> {
  if (!projectId) return null;

  const project = await loadProject(projectId);
  if (!project) {
    throw ipcError(IpcErrorCodes.PROJECT_NOT_FOUND, `Project not found: ${projectId}`);
  }
  return workflowsDir(project.path);
}

export async function readWorkflowDirectory(
  directory: string,
  source: WorkflowSource
): Promise<WorkflowTemplate[]> {
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const templates: WorkflowTemplate[] = [];

    for (const entry of entries) {
      if (!entry.isFile() || !isWorkflowFile(entry.name)) continue;

      const fallbackName = stripWorkflowExtension(entry.name);
      try {
        const yaml = await fs.readFile(join(directory, entry.name), "utf8");
        templates.push({ ...parseWorkflowYaml(yaml, fallbackName), source });
      } catch (error) {
        logger.warn(`[workflow] Failed to read workflow file: ${entry.name}`, error);
      }
    }

    return templates.sort((left, right) => left.name.localeCompare(right.name));
  } catch {
    return [];
  }
}

export async function listWorkflows(projectId?: string): Promise<WorkflowListResult> {
  const builtInFileNames = new Set(await listBuiltInWorkflowFileNames());
  const userTemplates = await readWorkflowDirectory(getUserWorkflowDirectory(), "custom");
  const projectWorkflowDirectory = await resolveProjectWorkflowDirectory(projectId);
  const projectTemplates = projectWorkflowDirectory
    ? await readWorkflowDirectory(projectWorkflowDirectory, "custom")
    : [];

  // Built-in templates live in the user directory (so they can be customized) but are
  // reported with source "built-in". Custom templates take precedence in display order.
  const builtInTemplates = userTemplates
    .filter((template) => builtInFileNames.has(toWorkflowFileName(template.id)))
    .map((template) => ({ ...template, source: "built-in" as const }));
  const customUserTemplates = userTemplates.filter(
    (template) => !builtInFileNames.has(toWorkflowFileName(template.id))
  );

  return {
    templates: [...customUserTemplates, ...projectTemplates, ...builtInTemplates],
  };
}

export async function saveWorkflow(request: WorkflowSaveRequest): Promise<void> {
  const directory = await resolveProjectWorkflowDirectory(request.projectId);
  if (!directory) {
    throw ipcError(IpcErrorCodes.PROJECT_REQUIRED, "Project is required to save workflow");
  }
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(join(directory, toWorkflowFileName(request.name)), request.yaml, "utf8");
}

export async function deleteWorkflow(request: WorkflowDeleteRequest): Promise<void> {
  const builtInFileNames = new Set(await listBuiltInWorkflowFileNames());
  const fileName = toWorkflowFileName(request.name);
  if (builtInFileNames.has(fileName)) {
    throw ipcError(IpcErrorCodes.BUILT_IN_WORKFLOW, "Built-in workflow cannot be deleted");
  }

  const directory = await resolveProjectWorkflowDirectory(request.projectId);
  if (!directory) {
    throw ipcError(IpcErrorCodes.PROJECT_REQUIRED, "Project is required to delete workflow");
  }
  await fs.rm(join(directory, fileName), { force: true });
}

export async function loadAllWorkflowTemplates(projectId: string): Promise<WorkflowTemplate[]> {
  const { templates } = await listWorkflows(projectId);
  return templates;
}
