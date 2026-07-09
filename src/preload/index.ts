import { contextBridge } from "electron";
import log from "electron-log/renderer";
import { acpAgentsApi } from "./api/platform/acp-agents";
import { appApi } from "./api/platform/app";
import { providersApi } from "./api/platform/providers";
import { releaseApi } from "./api/platform/release";
import { settingsApi } from "./api/platform/settings";
import { projectApi } from "./api/workspace/project";
import { windowApi } from "./api/workspace/window";
import { chatApi } from "./api/session/chat";
import { proposalArchiveApi } from "./api/proposal/archive";
import { proposalApplyApi } from "./api/proposal/apply";
import { proposalBrowserApi } from "./api/proposal/browser";
import { projectIntegrationApi } from "./api/automation/project-integration";
import { taskApi } from "./api/automation/task";
import { workflowApi } from "./api/automation/workflow";
import { guidelinesApi } from "./api/insight/guidelines";
import { lineageApi } from "./api/insight/lineage";
import { overviewApi } from "./api/insight/overview";
import { specsApi } from "./api/insight/specs";

const api = {
  platform: {
    app: appApi,
    settings: settingsApi,
    release: releaseApi,
    acpAgents: acpAgentsApi,
    providers: providersApi,
  },
  workspace: {
    project: projectApi,
    window: windowApi,
  },
  session: {
    chat: chatApi,
  },
  proposal: {
    browser: proposalBrowserApi,
    apply: proposalApplyApi,
    archive: proposalArchiveApi,
  },
  insight: {
    overview: overviewApi,
    specs: specsApi,
    guidelines: guidelinesApi,
    lineage: lineageApi,
  },
  automation: {
    workflow: workflowApi,
    task: taskApi,
    projectIntegration: projectIntegrationApi,
  },
};

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("api", api);
  } catch (error) {
    log.error("[preload] failed to expose contextBridge APIs", error);
  }
} else {
  // @ts-ignore (define in dts)
  window.api = api;
}
