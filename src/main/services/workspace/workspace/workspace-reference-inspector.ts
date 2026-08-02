import { hasPendingWorkspaceActions } from "@main/services/automation/_public";
import { hasActiveProposalWorkspaceReferences } from "@main/services/proposal/_public";
import { inspectSessionWorkspaceFolderReferences } from "@main/services/session/_public";
import { localFilePreviewService } from "@main/services/workspace/document/local-file-preview-service";
import type { WorkspaceFolderReferenceImpact } from "@shared/types/workspace";

export async function inspectWorkspaceFolderReferences(
  workspaceId: string,
  folderId: string
): Promise<WorkspaceFolderReferenceImpact> {
  const sessionImpact = await inspectSessionWorkspaceFolderReferences(workspaceId, folderId);
  const activeReferences = [...sessionImpact.activeReferences];

  if (hasActiveProposalWorkspaceReferences(workspaceId)) {
    activeReferences.push({ kind: "proposal-watcher", workspaceId, folderId });
  }
  if (await hasPendingWorkspaceActions(workspaceId, folderId)) {
    activeReferences.push({ kind: "pending-action", workspaceId, folderId });
  }
  if (localFilePreviewService.hasPendingWorkspaceDispatch(workspaceId)) {
    activeReferences.push({ kind: "preview-dispatch", workspaceId, folderId });
  }

  return {
    activeReferences,
    historicalSessions: sessionImpact.historicalSessions,
  };
}
