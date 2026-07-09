import { registerProjectIntegrationHandlers } from "./project-integration";
import { registerTaskHandlers } from "./task";
import { registerWorkflowHandlers } from "./workflow";

export function registerAutomationIpcHandlers(): void {
  registerProjectIntegrationHandlers();
  registerWorkflowHandlers();
  registerTaskHandlers();
}
