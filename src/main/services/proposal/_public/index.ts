import { proposalStatusService } from "../browser/proposal-status-service";

export { proposalStatusService };

export function hasActiveProposalWorkspaceReferences(workspaceId: string): boolean {
  return proposalStatusService.hasWorkspaceReferences(workspaceId);
}
