import { registerWorkspaceIntegrationHandlers } from "./workspace-integration";
import { registerTaskHandlers } from "./task";
import { registerWorkflowHandlers } from "./workflow";

export function registerAutomationIpcHandlers(): void {
  registerWorkspaceIntegrationHandlers();
  registerWorkflowHandlers();
  registerTaskHandlers();
}
