import type { ProposalRef, ProposalWorktreeMode } from "./proposal";

export type McpProposalEvent = {
  server: "fyllo-specs";
  tool: "create-proposal";
  createdAt: string;
  sessionId: string;
  workspaceId: string;
  proposalRef: ProposalRef;
  worktreeMode: ProposalWorktreeMode;
  worktreePath: string;
};

export type McpPlanEvent = {
  server: "fyllo-specs";
  tool: "create-plan";
  createdAt: string;
  sessionId: string;
  workspaceId: string;
  folderId: string;
  planSlug: string;
};

export type McpEvent = McpProposalEvent | McpPlanEvent;
