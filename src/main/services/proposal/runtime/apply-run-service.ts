import { promises as fs } from "fs";
import { join, resolve } from "path";
import { load, dump } from "js-yaml";
import type { ApplyRunMeta, ProposalStatus } from "@shared/types/proposal";
import type { WorkflowStage, WorkflowTemplate } from "@shared/types/workflow";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import { resolveWorkspace } from "@main/services/workspace/_public";
import { saveApplyRunMeta } from "@main/infra/storage/apply-run-store";
import {
  findProposalMetaById,
  resolveApplyRunChangeId,
  resolveChangeDir,
} from "@main/infra/proposal/openspec-reader";
import { loadAllWorkflowTemplates } from "@main/services/automation/_public";
import { newRunId } from "@main/infra/ids";
import { ipcError } from "@main/ipc/_kit/errors";
export { updateRunMetaIfCurrent } from "@main/infra/storage/apply-run-store";

export async function resolveWorkspaceCwd(workspaceId: string): Promise<string> {
  return (await resolveWorkspace(workspaceId)).cwd;
}

export async function findWorkflowTemplate(
  workspaceId: string,
  workflowId: string
): Promise<WorkflowTemplate | null> {
  const templates = await loadAllWorkflowTemplates(workspaceId);
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
  // currentStageIndex points to the stage that is *about* to run. Scan backwards from the
  // previous stage to find the most recently completed `proposal-apply` stage.
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
  workspaceId: string;
  changeId: string;
  workflowId: string;
}): Promise<{ runId: string; stages: WorkflowStage[] }> {
  const workspaceCwd = await resolveWorkspaceCwd(input.workspaceId);
  const template = await findWorkflowTemplate(input.workspaceId, input.workflowId);
  const proposalMeta = await findProposalMetaById(workspaceCwd, input.changeId);
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

  await saveApplyRunMeta(input.workspaceId, runMeta);
  await updateChangeStatus(workspaceCwd, input.changeId, "applying");

  return { runId, stages: template.stages };
}
