import { registerWorkspaceIntegrationHandlers } from "./workspace-integration";
import { registerTaskHandlers } from "./task";
import { registerWorkflowHandlers } from "./workflow";
import { registerWorkflowRunHandlers } from "./workflow-run";
import { registerWorkflowProposalHandlers } from "./workflow-proposal";
import { registerWorkflowProposalDecisionHandlers } from "./workflow-proposal-decision";

export function registerAutomationIpcHandlers(): void {
  registerWorkspaceIntegrationHandlers();
  registerWorkflowHandlers();
  registerWorkflowRunHandlers();
  registerWorkflowProposalHandlers();
  registerWorkflowProposalDecisionHandlers();
  registerTaskHandlers();
}
