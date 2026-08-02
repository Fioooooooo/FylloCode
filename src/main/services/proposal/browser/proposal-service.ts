import type { ProposalMeta, ProposalRef, ProposalSpecDeltaOverview } from "@shared/types/proposal";
import { resolveWorkspace } from "@main/services/workspace/_public";
import {
  readChangeFileInTarget,
  readRepositoryProposalFiles,
} from "@main/infra/proposal/openspec-reader";
import { listRegisteredWorktreePaths } from "@main/infra/git/worktree-reader";
import { getProposalSpecDeltas as readProposalSpecDeltas } from "./proposal-spec-delta-service";

export async function listProposals(workspaceId: string): Promise<ProposalMeta[]> {
  const workspace = await resolveWorkspace(workspaceId);
  const perFolder = await Promise.all(
    workspace.availableFolders.map(async (folder) => {
      try {
        const registered = await listRegisteredWorktreePaths(folder.folderPath);
        return await readRepositoryProposalFiles({
          folderId: folder.folderId,
          folderName: folder.folderName,
          folderPath: folder.folderPath,
          registeredWorktreePaths: registered.paths,
        });
      } catch {
        return [];
      }
    })
  );
  return perFolder
    .flat()
    .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime());
}

export async function resolveProposalMeta(
  workspaceId: string,
  proposalRef: ProposalRef
): Promise<ProposalMeta> {
  const proposal = (await listProposals(workspaceId)).find(
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
