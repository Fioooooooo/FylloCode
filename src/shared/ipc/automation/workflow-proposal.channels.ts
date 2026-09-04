export const AutomationWorkflowProposalChannels = {
  list: "automation:workflow-proposal:list",
  getDetail: "automation:workflow-proposal:getDetail",
  confirm: "automation:workflow-proposal:confirm",
  confirmDispatch: "automation:workflow-proposal:confirmDispatch",
  cancel: "automation:workflow-proposal:cancel",
  wake: "automation:workflow-proposal:wake",
} as const;

export const WorkflowProposalChannels = AutomationWorkflowProposalChannels;
