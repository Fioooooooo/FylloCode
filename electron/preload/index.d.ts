import { ElectronAPI } from "@electron-toolkit/preload";
import type { chatApi } from "./api/chat";
import type { projectApi } from "./api/project";
import type { proposalApi } from "./api/proposal";
import type { integrationApi } from "./api/integration";
import type { acpAgentsApi } from "./api/acp-agents";
import type { settingsApi } from "./api/settings";
import type { windowApi } from "./api/window";
import type { netApi } from "./api/net";
import type { workflowApi } from "./api/workflow";

export interface AppApi {
  chat: typeof chatApi;
  project: typeof projectApi;
  proposal: typeof proposalApi;
  integration: typeof integrationApi;
  acpAgents: typeof acpAgentsApi;
  settings: typeof settingsApi;
  window: typeof windowApi;
  net: typeof netApi;
  workflow: typeof workflowApi;
}

declare global {
  interface Window {
    electron: ElectronAPI;
    api: AppApi;
  }
}
