import type {
  WorkflowDeleteRequest,
  WorkflowDefinitionRecord,
  WorkflowListResult,
  WorkflowSaveRequest,
  WorkflowSaveResult,
} from "@shared/types/workflow";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import { ipcError } from "@shared/errors/ipc-error";
import { parseWorkflowYaml } from "@main/domain/automation/workflow/yaml-parser";
import { newWorkflowId } from "@main/infra/ids";
import {
  deleteWorkflowDefinition as deleteStoredWorkflowDefinition,
  listWorkflowDefinitions as listStoredWorkflowDefinitions,
  loadSessionWorkflowDefinition as loadStoredSessionWorkflowDefinition,
  loadWorkflowDefinition as loadStoredWorkflowDefinition,
  saveSessionWorkflowDefinition as saveStoredSessionWorkflowDefinition,
  saveWorkflowDefinition as saveStoredWorkflowDefinition,
} from "@main/infra/storage/workflow-definition-store";
import logger from "@main/infra/logger";

function toRecord(workflowId: string, yaml: string): WorkflowDefinitionRecord {
  const definition = parseWorkflowYaml(yaml);
  return {
    workflowId,
    name: definition.name,
    ...(definition.description ? { description: definition.description } : {}),
    yaml,
    definition,
  };
}

export async function loadWorkflowDefinition(
  workspaceId: string,
  workflowId: string
): Promise<WorkflowDefinitionRecord | null> {
  const stored = await loadStoredWorkflowDefinition(workspaceId, workflowId);
  return stored ? toRecord(stored.workflowId, stored.yaml) : null;
}

export async function loadSessionWorkflowDefinition(
  workspaceId: string,
  sessionId: string,
  workflowId: string
): Promise<WorkflowDefinitionRecord | null> {
  const stored = await loadStoredSessionWorkflowDefinition(workspaceId, sessionId, workflowId);
  return stored ? toRecord(stored.workflowId, stored.yaml) : null;
}

export async function saveSessionWorkflowDefinition(
  workspaceId: string,
  sessionId: string,
  workflowId: string,
  yaml: string
): Promise<WorkflowDefinitionRecord> {
  const definition = parseWorkflowYaml(yaml);
  await saveStoredSessionWorkflowDefinition(workspaceId, sessionId, workflowId, yaml);
  return {
    workflowId,
    name: definition.name,
    ...(definition.description ? { description: definition.description } : {}),
    yaml,
    definition,
  };
}

export async function listWorkflowDefinitions(workspaceId: string): Promise<WorkflowListResult> {
  const storedDefinitions = await listStoredWorkflowDefinitions(workspaceId);
  const workflows: WorkflowDefinitionRecord[] = [];
  for (const stored of storedDefinitions) {
    try {
      workflows.push(toRecord(stored.workflowId, stored.yaml));
    } catch (error) {
      // 保存后的文件理论上已经过校验；手动损坏时跳过该资产，避免污染其他 Workspace 的列表。
      logger.warn(`[workflow] Failed to parse definition: ${stored.workflowId}`, error);
    }
  }
  return { workflows };
}

export async function saveWorkflowDefinition(
  request: WorkflowSaveRequest
): Promise<WorkflowSaveResult> {
  const definition = parseWorkflowYaml(request.yaml);
  let workflowId = request.workflowId;
  if (workflowId) {
    const existing = await loadStoredWorkflowDefinition(request.workspaceId, workflowId);
    if (!existing) {
      throw ipcError(IpcErrorCodes.WORKFLOW_NOT_FOUND, `Workflow not found: ${workflowId}`);
    }
  } else {
    do {
      workflowId = newWorkflowId();
    } while (await loadStoredWorkflowDefinition(request.workspaceId, workflowId));
  }
  await saveStoredWorkflowDefinition(request.workspaceId, workflowId, request.yaml);
  return {
    workflowId,
    name: definition.name,
    ...(definition.description ? { description: definition.description } : {}),
    yaml: request.yaml,
    definition,
  };
}

export async function deleteWorkflowDefinition(request: WorkflowDeleteRequest): Promise<void> {
  const existing = await loadStoredWorkflowDefinition(request.workspaceId, request.workflowId);
  if (!existing) {
    throw ipcError(IpcErrorCodes.WORKFLOW_NOT_FOUND, `Workflow not found: ${request.workflowId}`);
  }
  await deleteStoredWorkflowDefinition(request.workspaceId, request.workflowId);
}
