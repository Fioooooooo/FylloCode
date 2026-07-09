import { registerAutomationIpcHandlers } from "./automation";
import { registerInsightIpcHandlers } from "./insight";
import { registerPlatformIpcHandlers } from "./platform";
import { registerProposalIpcHandlers } from "./proposal";
import { registerSessionIpcHandlers } from "./session";
import { registerWorkspaceIpcHandlers } from "./workspace";

export function registerAllHandlers(): void {
  registerPlatformIpcHandlers();
  registerWorkspaceIpcHandlers();
  registerSessionIpcHandlers();
  registerProposalIpcHandlers();
  registerAutomationIpcHandlers();
  registerInsightIpcHandlers();
}
