export const AutomationWorkflowRunChannels = {
  list: "automation:workflow-run:list",
  getDetail: "automation:workflow-run:getDetail",
  decide: "automation:workflow-run:decide",
  wake: "automation:workflow-run:wake",
} as const;

export const WorkflowRunChannels = AutomationWorkflowRunChannels;
