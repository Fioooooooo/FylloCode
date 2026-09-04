export const AutomationWorkflowProposalDecisionChannels = {
  list: "automation:workflow-proposal:decisionList",
  dispatch: "automation:workflow-proposal:decisionDispatch",
  wake: "automation:workflow-proposal:decisionWake",
} as const;

export const WorkflowProposalDecisionChannels = AutomationWorkflowProposalDecisionChannels;
