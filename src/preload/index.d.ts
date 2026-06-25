import type { appApi } from "./api/app";
import type { chatApi } from "./api/chat";
import type { projectApi } from "./api/project";
import type { proposalApi } from "./api/proposal";
import type { integrationApi } from "./api/integration";
import type { acpAgentsApi } from "./api/acp-agents";
import type { settingsApi } from "./api/settings";
import type { workflowApi } from "./api/workflow";
import type { taskApi } from "./api/task";
import type { lineageApi } from "./api/lineage";
import type { overviewApi } from "./api/overview";
import type { specsApi } from "./api/specs";

type SettingsApi = typeof settingsApi;
type ChatApi = typeof chatApi;

export interface AppApi {
  app: typeof appApi;
  chat: ChatApi;
  project: typeof projectApi;
  proposal: typeof proposalApi;
  integration: typeof integrationApi;
  acpAgents: typeof acpAgentsApi;
  settings: SettingsApi;
  workflow: typeof workflowApi;
  task: typeof taskApi;
  lineage: typeof lineageApi;
  overview: typeof overviewApi;
  specs: typeof specsApi;
}

declare global {
  interface Window {
    api: AppApi;
  }
}
