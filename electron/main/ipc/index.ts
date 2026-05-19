import { registerChatHandlers } from "./chat";
import { registerProjectHandlers } from "./project";
import { registerProposalHandlers } from "./proposal";
import { registerProposalApplyHandlers } from "./proposal-apply";
import { registerIntegrationHandlers } from "./integration";
import { registerAcpAgentHandlers } from "./acp-agents";
import { registerSettingsHandlers } from "./settings";
import { registerWorkflowHandlers } from "./workflow";
import { registerTaskHandlers } from "./task";

export function registerAllHandlers(): void {
  registerChatHandlers();
  registerProjectHandlers();
  registerProposalHandlers();
  registerProposalApplyHandlers();
  registerWorkflowHandlers();
  registerTaskHandlers();
  registerIntegrationHandlers();
  registerAcpAgentHandlers();
  registerSettingsHandlers();
}
