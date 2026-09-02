import type { Pinia } from "pinia";
import { workflowRunApi } from "@renderer/api/automation/workflow-run";
import { useWorkflowRunStore } from "@renderer/stores";
import { useWorkspaceStore } from "@renderer/stores";

export function registerWorkflowRunWakeListener(pinia: Pinia): () => void {
  const workspaceStore = useWorkspaceStore(pinia);
  const workflowRunStore = useWorkflowRunStore(pinia);
  return workflowRunApi.onWake((payload) => {
    if (workspaceStore.currentWorkspace?.id !== payload.workspaceId) return;
    void workflowRunStore.handleWake(payload);
  });
}
