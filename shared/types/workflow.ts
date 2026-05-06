export type WorkflowStageType =
  | "proposal-apply"
  | "code-review"
  | "security-check"
  | "create-pr"
  | "custom";

export type WorkflowStage = {
  id: string;
  name: string;
  type: WorkflowStageType;
  agent?: string;
  prompt?: string;
  when?: string;
  onFailure?: string;
  mcp?: string[];
  skills?: string[];
};

export type WorkflowTemplate = {
  id: string;
  name: string;
  description?: string;
  version?: number;
  source: "built-in" | "custom";
  yaml: string;
  stages: WorkflowStage[];
};

export type WorkflowSaveRequest = {
  name: string;
  yaml: string;
  projectId?: string;
};

export type WorkflowListRequest = {
  projectId?: string;
};

export type WorkflowListResult = {
  templates: WorkflowTemplate[];
};

export type WorkflowDeleteRequest = {
  name: string;
  projectId?: string;
};
