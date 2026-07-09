import type { acpAgentsApi } from "./api/platform/acp-agents";
import type { appApi } from "./api/platform/app";
import type { providersApi } from "./api/platform/providers";
import type { releaseApi } from "./api/platform/release";
import type { settingsApi } from "./api/platform/settings";
import type { projectApi } from "./api/workspace/project";
import type { windowApi } from "./api/workspace/window";
import type { chatApi } from "./api/session/chat";
import type { proposalArchiveApi } from "./api/proposal/archive";
import type { proposalApplyApi } from "./api/proposal/apply";
import type { proposalBrowserApi } from "./api/proposal/browser";
import type { projectIntegrationApi } from "./api/automation/project-integration";
import type { taskApi } from "./api/automation/task";
import type { workflowApi } from "./api/automation/workflow";
import type { guidelinesApi } from "./api/insight/guidelines";
import type { lineageApi } from "./api/insight/lineage";
import type { overviewApi } from "./api/insight/overview";
import type { specsApi } from "./api/insight/specs";

export interface AppApi {
  platform: {
    app: typeof appApi;
    settings: typeof settingsApi;
    release: typeof releaseApi;
    acpAgents: typeof acpAgentsApi;
    providers: typeof providersApi;
  };
  workspace: {
    project: typeof projectApi;
    window: typeof windowApi;
  };
  session: {
    chat: typeof chatApi;
  };
  proposal: {
    browser: typeof proposalBrowserApi;
    apply: typeof proposalApplyApi;
    archive: typeof proposalArchiveApi;
  };
  insight: {
    overview: typeof overviewApi;
    specs: typeof specsApi;
    guidelines: typeof guidelinesApi;
    lineage: typeof lineageApi;
  };
  automation: {
    workflow: typeof workflowApi;
    task: typeof taskApi;
    projectIntegration: typeof projectIntegrationApi;
  };
}

declare global {
  interface Window {
    api: AppApi;
  }
}
