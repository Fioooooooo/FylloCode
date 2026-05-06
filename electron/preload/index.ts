import { contextBridge } from "electron";
import { electronAPI } from "@electron-toolkit/preload";
import { chatApi } from "./api/chat";
import { projectApi } from "./api/project";
import { proposalApi } from "./api/proposal";
import { integrationApi } from "./api/integration";
import { acpAgentsApi } from "./api/acp-agents";
import { settingsApi } from "./api/settings";
import { windowApi } from "./api/window";
import { netApi } from "./api/net";
import { workflowApi } from "./api/workflow";

const api = {
  chat: chatApi,
  project: projectApi,
  proposal: proposalApi,
  integration: integrationApi,
  acpAgents: acpAgentsApi,
  settings: settingsApi,
  window: windowApi,
  net: netApi,
  workflow: workflowApi,
};

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("electron", electronAPI);
    contextBridge.exposeInMainWorld("api", api);
  } catch (error) {
    console.error(error);
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI;
  // @ts-ignore (define in dts)
  window.api = api;
}
