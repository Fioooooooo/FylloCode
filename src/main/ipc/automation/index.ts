import { registerWorkspaceIntegrationHandlers } from "./workspace-integration";
import { registerTaskHandlers } from "./task";
import { registerWorkflowHandlers } from "./workflow";
import { registerWorkflowRunHandlers } from "./workflow-run";

export function registerAutomationIpcHandlers(): void {
  registerWorkspaceIntegrationHandlers();
  registerWorkflowHandlers();
  registerWorkflowRunHandlers();
  registerTaskHandlers();
}
