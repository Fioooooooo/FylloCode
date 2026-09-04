import { watch, type WatchStopHandle } from "vue";
import { registerWorkflowRunWakeListener } from "@renderer/features/workflow-run-inspector";
import {
  registerWorkflowProposalDecisionWakeListener,
  registerWorkflowProposalWakeListener,
} from "@renderer/features/workflow-proposal-review";
import { useWorkflowProposalStore, useWorkflowRunStore, useWorkspaceStore } from "@renderer/stores";
import { onFylloBootstrap } from "../core";

let unsubscribeWake: (() => void) | null = null;
let unsubscribeProposalWake: (() => void) | null = null;
let unsubscribeDecisionWake: (() => void) | null = null;
let stopWorkspaceWatch: WatchStopHandle | null = null;

export function registerWorkflowRunsTask(): void {
  onFylloBootstrap({
    name: "workflow-runs",
    phase: "background",
    run({ pinia }) {
      unsubscribeWake?.();
      unsubscribeProposalWake?.();
      unsubscribeDecisionWake?.();
      stopWorkspaceWatch?.();
      const workspaceStore = useWorkspaceStore(pinia);
      const workflowRunStore = useWorkflowRunStore(pinia);
      const workflowProposalStore = useWorkflowProposalStore(pinia);
      unsubscribeWake = registerWorkflowRunWakeListener(pinia);
      unsubscribeProposalWake = registerWorkflowProposalWakeListener(pinia);
      unsubscribeDecisionWake = registerWorkflowProposalDecisionWakeListener(pinia);
      stopWorkspaceWatch = watch(
        () => workspaceStore.currentWorkspace?.id,
        (_next, previous) => {
          if (previous) workflowRunStore.resetWorkspace(previous);
          if (previous) workflowProposalStore.resetWorkspace(previous);
        }
      );
    },
  });
}

export function resetWorkflowRunsTaskForTests(): void {
  unsubscribeWake?.();
  unsubscribeProposalWake?.();
  unsubscribeDecisionWake?.();
  stopWorkspaceWatch?.();
  unsubscribeWake = null;
  unsubscribeProposalWake = null;
  unsubscribeDecisionWake = null;
  stopWorkspaceWatch = null;
}
