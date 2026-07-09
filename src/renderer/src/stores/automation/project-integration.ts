import { defineStore } from "pinia";
import { projectIntegrationApi } from "@renderer/api/automation/project-integration";

export const useProjectIntegrationStore = defineStore("project-integration", () => {
  return {
    getProjectIntegration: projectIntegrationApi.getProjectIntegration,
    setProjectIntegration: projectIntegrationApi.setProjectIntegration,
  };
});
