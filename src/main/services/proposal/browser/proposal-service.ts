import type {
  ProposalBrowserOverview,
  ProposalMeta,
  ProposalRef,
  ProposalSpecDeltaOverview,
} from "@shared/types/proposal";
import { resolveWorkspace } from "@main/services/workspace/_public";
import {
  readChangeFileInTarget,
  readRepositoryProposalFiles,
} from "@main/infra/proposal/openspec-reader";
import { listRegisteredWorktreePaths } from "@main/infra/git/worktree-reader";
import { getProposalSpecDeltas as readProposalSpecDeltas } from "./proposal-spec-delta-service";
import { aggregateWorkspaceRepositories } from "@main/services/insight/_public";
import { proposalStatusService, type ProposalWatchContext } from "./proposal-status-service";

export async function listProposals(workspaceId: string): Promise<ProposalBrowserOverview> {
  const workspace = await resolveWorkspace(workspaceId);
  const aggregate = await aggregateWorkspaceRepositories(workspace, async (folder) => {
    const registered = await listRegisteredWorktreePaths(folder.folderPath);
    const items = await readRepositoryProposalFiles({
      folderId: folder.folderId,
      folderName: folder.folderName,
      folderPath: folder.folderPath,
      registeredWorktreePaths: registered.paths,
    });
    return {
      items,
      warnings: registered.warning ? [{ message: registered.warning }] : [],
    };
  });

  return {
    ...aggregate,
    items: [...aggregate.items].sort(
      (left, right) => new Date(right.date).getTime() - new Date(left.date).getTime()
    ),
  };
}

export async function resolveProposalMeta(
  workspaceId: string,
  proposalRef: ProposalRef
): Promise<ProposalMeta> {
  const proposal = (await listProposals(workspaceId)).items.find(
    (candidate) =>
      candidate.proposalRef.folderId === proposalRef.folderId &&
      candidate.proposalRef.changeId === proposalRef.changeId
  );
  if (!proposal) {
    throw Object.assign(new Error(`Proposal not found: ${proposalRef.changeId}`), {
      code: "PROPOSAL_NOT_FOUND",
      details: { workspaceId, proposalRef },
    });
  }
  return proposal;
}

export async function resolveProposalWatchContext(
  workspaceId: string,
  proposalRef: ProposalRef
): Promise<ProposalWatchContext> {
  const [proposal, workspace] = await Promise.all([
    resolveProposalMeta(workspaceId, proposalRef),
    resolveWorkspace(workspaceId),
  ]);
  const owner = workspace.availableFolders.find(
    (folder) => folder.folderId === proposalRef.folderId
  );
  if (!owner) {
    throw Object.assign(new Error(`Proposal owner is unavailable: ${proposalRef.folderId}`), {
      code: "PROPOSAL_OWNER_UNAVAILABLE",
      details: { workspaceId, proposalRef },
    });
  }
  return {
    ownerMainPath: owner.folderPath,
    targetPath: proposal.worktreePath,
    worktreeMode: proposal.worktreeMode,
  };
}

export async function watchProposalStatus(
  workspaceId: string,
  proposalRef: ProposalRef,
  sessionId: string
): Promise<void> {
  const context = await resolveProposalWatchContext(workspaceId, proposalRef);
  proposalStatusService.watchProposal(workspaceId, proposalRef, context, sessionId);
}

export async function readProposalFile(
  workspaceId: string,
  proposalRef: ProposalRef,
  filename: string
): Promise<string | null> {
  const proposal = await resolveProposalMeta(workspaceId, proposalRef);
  return readChangeFileInTarget(proposal.worktreePath, proposalRef.changeId, filename);
}

export async function getProposalSpecDeltas(
  workspaceId: string,
  proposalRef: ProposalRef
): Promise<ProposalSpecDeltaOverview> {
  const proposal = await resolveProposalMeta(workspaceId, proposalRef);
  return readProposalSpecDeltas(proposal.worktreePath, proposalRef.changeId);
}
