import { promises as fs } from "fs";
import { join } from "path";
import { load, dump } from "js-yaml";
import type { ApplyRunMeta, ProposalRef, ProposalStatus } from "@shared/types/proposal";
import type { WorkflowStage, WorkflowTemplate } from "@shared/types/workflow";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import { resolveRepositoryTarget, resolveWorkspace } from "@main/services/workspace/_public";
import { saveApplyRunMeta } from "@main/infra/storage/apply-run-store";
import {
  resolveApplyRunChangeId,
  resolveChangeDirInTarget,
} from "@main/infra/proposal/openspec-reader";
import { resolveProposalMeta } from "@main/services/proposal/browser/proposal-service";
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
  worktreePath: string,
  changeId: string,
  nextStatus: ProposalStatus
): Promise<void> {
  const changeDir = await resolveChangeDirInTarget(worktreePath, changeId);
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

function hasMatchingProposalRef(runMeta: ApplyRunMeta, proposalRef: ProposalRef): boolean {
  return (
    runMeta.proposalRef?.folderId === proposalRef.folderId &&
    runMeta.proposalRef.changeId === proposalRef.changeId
  );
}

export async function validateApplyRunTarget(
  workspaceId: string,
  proposalRef: ProposalRef,
  runMeta: ApplyRunMeta
): Promise<{ folderId: string; worktreePath: string }> {
  if (!hasMatchingProposalRef(runMeta, proposalRef) || !runMeta.worktreePath) {
    throw ipcError(
      IpcErrorCodes.APPLY_RUN_NOT_READY,
      `Apply run owner is unavailable: ${proposalRef.changeId}`
    );
  }

  try {
    const target = await resolveRepositoryTarget({
      workspaceId,
      folderId: proposalRef.folderId,
      worktreePath: runMeta.worktreePath,
    });
    if (!(await resolveChangeDirInTarget(target.worktreePath, proposalRef.changeId))) {
      throw new Error("proposal is missing from the fixed target");
    }
    return target;
  } catch {
    throw ipcError(
      IpcErrorCodes.PROPOSAL_NOT_FOUND,
      `Proposal target is no longer available: ${proposalRef.changeId}`
    );
  }
}

/**
 * Create a fresh apply run: locates the workflow template, persists an
 * `ApplyRunMeta`, and flips the change status to `applying`.
 * Returns the new runId and the stage list the renderer should render.
 */
export async function createApplyRun(input: {
  workspaceId: string;
  folderId: string;
  changeId: string;
  workflowId: string;
}): Promise<{ runId: string; stages: WorkflowStage[] }> {
  const template = await findWorkflowTemplate(input.workspaceId, input.workflowId);
  if (!template) {
    throw ipcError(IpcErrorCodes.WORKFLOW_NOT_FOUND, `Workflow not found: ${input.workflowId}`);
  }
  const proposalRef = { folderId: input.folderId, changeId: input.changeId };
  const proposalMeta = await resolveProposalMeta(input.workspaceId, proposalRef);

  const runId = newRunId();
  const startedAt = new Date().toISOString();
  const runMeta: ApplyRunMeta = {
    runId,
    proposalRef,
    workflowId: input.workflowId,
    stages: template.stages,
    currentStageIndex: 0,
    stageAcpSessionIds: {},
    status: "running",
    startedAt,
    updatedAt: startedAt,
    worktreePath: proposalMeta.worktreePath,
  };

  await saveApplyRunMeta(input.workspaceId, runMeta);
  await updateChangeStatus(proposalMeta.worktreePath, input.changeId, "applying");

  return { runId, stages: template.stages };
}
