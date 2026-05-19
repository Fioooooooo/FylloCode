import type { chatApi } from "./api/chat";
import type { projectApi } from "./api/project";
import type { proposalApi } from "./api/proposal";
import type { integrationApi } from "./api/integration";
import type { acpAgentsApi } from "./api/acp-agents";
import type { settingsApi } from "./api/settings";
import type { workflowApi } from "./api/workflow";
import type { taskApi } from "./api/task";

type SettingsApi = typeof settingsApi;

export interface AppApi {
  chat: typeof chatApi;
  project: typeof projectApi;
  proposal: typeof proposalApi;
  integration: typeof integrationApi;
  acpAgents: typeof acpAgentsApi;
  settings: SettingsApi;
  workflow: typeof workflowApi;
  task: typeof taskApi;
}

declare global {
  interface Window {
    api: AppApi;
  }
}
