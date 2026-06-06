import { promises as fs } from "fs";
import { join, resolve } from "path";
import { load, dump } from "js-yaml";
import type { ApplyRunMeta, ProposalStatus } from "@shared/types/proposal";
import type { WorkflowStage, WorkflowTemplate } from "@shared/types/workflow";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import { loadProject } from "@main/infra/storage/project-store";
import { saveApplyRunMeta } from "@main/infra/storage/apply-run-store";
import {
  findProposalMetaById,
  resolveApplyRunChangeId,
  resolveChangeDir,
} from "@main/domain/proposal/openspec-reader";
import { loadAllWorkflowTemplates } from "@main/services/workflow/workflow-service";
import { newRunId } from "@main/infra/ids";
import { ipcError } from "@main/ipc/_kit/errors";
export { updateRunMetaIfCurrent } from "@main/infra/storage/apply-run-store";

export async function resolveProjectPath(projectId: string): Promise<string> {
  const project = await loadProject(projectId);
  if (!project) {
    throw ipcError(IpcErrorCodes.PROJECT_NOT_FOUND, `Project not found: ${projectId}`);
  }
  return project.path;
}

export async function findWorkflowTemplate(
  projectId: string,
  workflowId: string
): Promise<WorkflowTemplate | null> {
  const templates = await loadAllWorkflowTemplates(projectId);
  return templates.find((template) => template.id === workflowId) ?? null;
}

export { resolveApplyRunChangeId };

export async function updateChangeStatus(
  projectPath: string,
  changeId: string,
  nextStatus: ProposalStatus
): Promise<void> {
  const changeDir = await resolveChangeDir(projectPath, changeId);
  if (!changeDir) {
    throw ipcError(IpcErrorCodes.PROPOSAL_NOT_FOUND, `Proposal not found: ${changeId}`);
  }

  const yamlPath = join(changeDir, ".openspec.yaml");
  const content = await fs.readFile(yamlPath, "utf8");
  const parsed = load(content);
  const nextDoc = parsed && typeof parsed === "object" ? parsed : {};
  (nextDoc as Record<string, unknown>).status = nextStatus;
  await fs.writeFile(yamlPath, dump(nextDoc), "utf8");
}

export function getCompletedApplyStageIndex(runMeta: ApplyRunMeta): number {
  const completedUntil = Math.min(runMeta.currentStageIndex, runMeta.stages.length) - 1;
  for (let index = completedUntil; index >= 0; index -= 1) {
    if (runMeta.stages[index]?.type === "proposal-apply") {
      return index;
    }
  }
  return -1;
}

export function buildArchiveStage(agentId: string): WorkflowStage {
  return {
    id: "archive",
    name: "归档",
    type: "proposal-archive",
    agent: agentId,
  };
}

/**
 * Create a fresh apply run: locates the workflow template, persists an
 * `ApplyRunMeta`, and flips the change status to `applying`.
 * Returns the new runId and the stage list the renderer should render.
 */
export async function createApplyRun(input: {
  projectId: string;
  changeId: string;
  workflowId: string;
}): Promise<{ runId: string; stages: WorkflowStage[] }> {
  const projectPath = await resolveProjectPath(input.projectId);
  const template = await findWorkflowTemplate(input.projectId, input.workflowId);
  const proposalMeta = await findProposalMetaById(projectPath, input.changeId);
  if (!template) {
    throw ipcError(IpcErrorCodes.WORKFLOW_NOT_FOUND, `Workflow not found: ${input.workflowId}`);
  }

  const runId = newRunId();
  const startedAt = new Date().toISOString();
  const runMeta: ApplyRunMeta = {
    runId,
    changeId: input.changeId,
    workflowId: input.workflowId,
    stages: template.stages,
    currentStageIndex: 0,
    stageAcpSessionIds: {},
    status: "running",
    startedAt,
    updatedAt: startedAt,
    worktreePath: proposalMeta?.worktreePath ? resolve(proposalMeta.worktreePath) : undefined,
  };

  await saveApplyRunMeta(projectPath, runMeta);
  await updateChangeStatus(projectPath, input.changeId, "applying");

  return { runId, stages: template.stages };
}
