export type McpProposalEvent = {
  server: "fyllo-specs";
  tool: "create-proposal";
  createdAt: string;
  sessionId: string;
  changeId: string;
};

export type McpPlanEvent = {
  server: "fyllo-specs";
  tool: "create-plan";
  createdAt: string;
  sessionId: string;
  planSlug: string;
};

export type McpEvent = McpProposalEvent | McpPlanEvent;
