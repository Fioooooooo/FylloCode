import { defineStore } from "pinia";
import { workspaceIntegrationApi } from "@renderer/api/automation/workspace-integration";

export const useWorkspaceIntegrationStore = defineStore("workspace-integration", () => {
  return {
    getWorkspaceIntegration: workspaceIntegrationApi.getWorkspaceIntegration,
    setWorkspaceIntegration: workspaceIntegrationApi.setWorkspaceIntegration,
  };
});
