import { watch, type WatchStopHandle } from "vue";
import { registerWorkflowRunWakeListener } from "@renderer/features/workflow-run-inspector";
import { useWorkflowRunStore, useWorkspaceStore } from "@renderer/stores";
import { onFylloBootstrap } from "../core";

let unsubscribeWake: (() => void) | null = null;
let stopWorkspaceWatch: WatchStopHandle | null = null;

export function registerWorkflowRunsTask(): void {
  onFylloBootstrap({
    name: "workflow-runs",
    phase: "background",
    run({ pinia }) {
      unsubscribeWake?.();
      stopWorkspaceWatch?.();
      const workspaceStore = useWorkspaceStore(pinia);
      const workflowRunStore = useWorkflowRunStore(pinia);
      unsubscribeWake = registerWorkflowRunWakeListener(pinia);
      stopWorkspaceWatch = watch(
        () => workspaceStore.currentWorkspace?.id,
        (_next, previous) => {
          if (previous) workflowRunStore.resetWorkspace(previous);
        }
      );
    },
  });
}

export function resetWorkflowRunsTaskForTests(): void {
  unsubscribeWake?.();
  stopWorkspaceWatch?.();
  unsubscribeWake = null;
  stopWorkspaceWatch = null;
}
