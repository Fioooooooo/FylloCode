import type { ApplyRunMeta, ProposalMeta, ProposalStatus } from "@shared/types/proposal";

export type ProposalDisplayStatus = ProposalStatus | "archiveReady" | "archiving";

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
  archiving: { label: "归档中", color: "warning", variant: "soft" },
  archived: { label: "已归档", color: "neutral", variant: "outline" },
};

export function canArchiveProposal(
  proposal: ProposalMeta | null | undefined,
  runMeta: ApplyRunMeta | null | undefined,
  isArchiving: boolean
): boolean {
  return (
    proposal?.status === "applying" &&
    runMeta?.status === "done" &&
    runMeta.changeId === proposal.id &&
    !isArchiving
  );
}

export function isArchivingProposal(
  proposal: ProposalMeta | null | undefined,
  runMeta: ApplyRunMeta | null | undefined,
  isArchiving: boolean
): boolean {
  return proposal?.status === "applying" && isArchiving && runMeta?.changeId === proposal.id;
}

export function getProposalDisplayStatus(
  proposal: ProposalMeta,
  runMeta: ApplyRunMeta | null | undefined,
  isArchiving: boolean
): ProposalDisplayStatus;
export function getProposalDisplayStatus(
  proposal: ProposalMeta | null | undefined,
  runMeta: ApplyRunMeta | null | undefined,
  isArchiving: boolean
): ProposalDisplayStatus | null;
export function getProposalDisplayStatus(
  proposal: ProposalMeta | null | undefined,
  runMeta: ApplyRunMeta | null | undefined,
  isArchiving: boolean
): ProposalDisplayStatus | null {
  if (!proposal) {
    return null;
  }

  if (isArchivingProposal(proposal, runMeta, isArchiving)) {
    return "archiving";
  }

  return canArchiveProposal(proposal, runMeta, isArchiving) ? "archiveReady" : proposal.status;
}
