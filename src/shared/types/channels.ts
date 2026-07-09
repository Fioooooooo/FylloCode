import { PlatformSettingsChannels } from "@shared/ipc/platform/settings.channels";
import { PlatformReleaseChannels } from "@shared/ipc/platform/release.channels";
import { ProposalBrowserChannels } from "@shared/ipc/proposal/browser.channels";
import { ProposalApplyChannels } from "@shared/ipc/proposal/apply.channels";
import { ProposalArchiveChannels } from "@shared/ipc/proposal/archive.channels";

export {
  PlatformAppChannels,
  PlatformAppChannels as AppChannels,
} from "@shared/ipc/platform/app.channels";
export { PlatformSettingsChannels, PlatformReleaseChannels };
export {
  PlatformAcpAgentChannels,
  PlatformAcpAgentChannels as AcpAgentChannels,
} from "@shared/ipc/platform/acp-agents.channels";
export { PlatformProvidersChannels } from "@shared/ipc/platform/providers.channels";
export {
  WorkspaceProjectChannels,
  WorkspaceProjectChannels as ProjectChannels,
} from "@shared/ipc/workspace/project.channels";
export {
  WorkspaceWindowChannels,
  WorkspaceWindowChannels as WindowChannels,
} from "@shared/ipc/workspace/window.channels";
export {
  SessionChatChannels,
  SessionChatChannels as ChatChannels,
  SessionChatProbeChannels,
  SessionChatProbeChannels as ChatProbeChannels,
  SessionChatStreamChannels,
  SessionChatStreamChannels as ChatStreamChannels,
} from "@shared/ipc/session/chat.channels";
export { ProposalBrowserChannels, ProposalApplyChannels, ProposalArchiveChannels };
export {
  InsightOverviewChannels,
  InsightOverviewChannels as OverviewChannels,
} from "@shared/ipc/insight/overview.channels";
export {
  InsightSpecsChannels,
  InsightSpecsChannels as SpecsChannels,
} from "@shared/ipc/insight/specs.channels";
export {
  InsightGuidelinesChannels,
  InsightGuidelinesChannels as GuidelinesChannels,
} from "@shared/ipc/insight/guidelines.channels";
export {
  InsightLineageChannels,
  InsightLineageChannels as LineageChannels,
} from "@shared/ipc/insight/lineage.channels";
export {
  AutomationWorkflowChannels,
  AutomationWorkflowChannels as WorkflowChannels,
} from "@shared/ipc/automation/workflow.channels";
export {
  AutomationTaskChannels,
  AutomationTaskChannels as TaskChannels,
} from "@shared/ipc/automation/task.channels";
export { AutomationProjectIntegrationChannels } from "@shared/ipc/automation/project-integration.channels";
export { IntegrationChannels } from "@shared/ipc/integration.compat";

export const SettingsChannels = {
  ...PlatformSettingsChannels,
  checkLatestRelease: PlatformReleaseChannels.checkLatestRelease,
} as const;

export const ProposalChannels = {
  ...ProposalBrowserChannels,
  ...ProposalApplyChannels,
  ...ProposalArchiveChannels,
} as const;
