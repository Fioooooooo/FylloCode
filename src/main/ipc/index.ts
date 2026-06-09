import { registerAppHandlers } from "./app";
import { registerChatHandlers } from "./chat";
import { registerProjectHandlers } from "./project";
import { registerProposalHandlers } from "./proposal";
import { registerProposalApplyHandlers } from "./proposal-apply";
import { registerIntegrationHandlers } from "./integration";
import { registerAcpAgentHandlers } from "./acp-agents";
import { registerSettingsHandlers } from "./settings";
import { registerWorkflowHandlers } from "./workflow";
import { registerTaskHandlers } from "./task";
import { registerLineageHandlers } from "./lineage";

export function registerAllHandlers(): void {
  registerAppHandlers();
  registerChatHandlers();
  registerProjectHandlers();
  registerProposalHandlers();
  registerProposalApplyHandlers();
  registerWorkflowHandlers();
  registerTaskHandlers();
  registerLineageHandlers();
  registerIntegrationHandlers();
  registerAcpAgentHandlers();
  registerSettingsHandlers();
}
