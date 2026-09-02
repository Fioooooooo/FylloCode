import type { ProposalMeta, ProposalStatus } from "@shared/types/proposal";

export type ProposalDisplayStatus = ProposalStatus | "archiveReady";

type ProposalStatusConfig = {
  label: string;
  color: "neutral" | "primary" | "warning" | "success" | "error" | "info" | "secondary";
  variant: "soft" | "outline" | "subtle";
};

export const proposalDisplayStatusConfig: Record<ProposalDisplayStatus, ProposalStatusConfig> = {
  creating: { label: "创建中", color: "primary", variant: "soft" },
  draft: { label: "已创建", color: "neutral", variant: "soft" },
  applying: { label: "实现中", color: "primary", variant: "soft" },
  archiveReady: { label: "可归档", color: "warning", variant: "soft" },
  archived: { label: "已归档", color: "neutral", variant: "outline" },
};

export function canArchiveProposal(proposal: ProposalMeta | null | undefined): boolean {
  return (
    proposal?.status === "applying" &&
    proposal.totalTasks > 0 &&
    proposal.doneTasks === proposal.totalTasks
  );
}

export function getProposalDisplayStatus(proposal: ProposalMeta): ProposalDisplayStatus;
export function getProposalDisplayStatus(
  proposal: ProposalMeta | null | undefined
): ProposalDisplayStatus | null;
export function getProposalDisplayStatus(
  proposal: ProposalMeta | null | undefined
): ProposalDisplayStatus | null {
  if (!proposal) {
    return null;
  }

  return canArchiveProposal(proposal) ? "archiveReady" : proposal.status;
}
