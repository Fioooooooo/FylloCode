import { contextBridge } from "electron";
import log from "electron-log/renderer";
import { chatApi } from "./api/chat";
import { projectApi } from "./api/project";
import { proposalApi } from "./api/proposal";
import { integrationApi } from "./api/integration";
import { acpAgentsApi } from "./api/acp-agents";
import { settingsApi } from "./api/settings";
import { workflowApi } from "./api/workflow";
import { taskApi } from "./api/task";

const api = {
  chat: chatApi,
  project: projectApi,
  proposal: proposalApi,
  integration: integrationApi,
  acpAgents: acpAgentsApi,
  settings: settingsApi,
  workflow: workflowApi,
  task: taskApi,
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
