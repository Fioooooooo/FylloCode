import type { Pinia } from "pinia";
import { workflowProposalApi } from "@renderer/api/automation/workflow-proposal";
import { useChatStore } from "@renderer/stores/session";
import { useWorkflowProposalStore, useWorkspaceStore } from "@renderer/stores";

interface DecisionDrainController {
  timer: ReturnType<typeof setTimeout> | null;
  inFlight: Promise<void> | null;
  requested: boolean;
  disposed: boolean;
}

const controllers = new WeakMap<object, DecisionDrainController>();

function controllerFor(pinia: Pinia): DecisionDrainController {
  const existing = controllers.get(pinia);
  if (existing && !existing.disposed) return existing;
  if (existing) controllers.delete(pinia);
  const created: DecisionDrainController = {
    timer: null,
    inFlight: null,
    requested: false,
    disposed: false,
  };
  controllers.set(pinia, created);
  return created;
}

function scheduleDecisionRetry(workspaceId: string, pinia: Pinia): void {
  const controller = controllerFor(pinia);
  if (controller.disposed || controller.timer) return;
  controller.timer = setTimeout(() => {
    controller.timer = null;
    void drainWorkflowProposalDecisions(workspaceId, pinia).catch((error: unknown) => {
      console.error("Workflow proposal decision drain failed:", error);
    });
  }, 1000);
}

async function dispatchDecision(
  workspaceId: string,
  notificationId: string,
  parentSessionId: string,
  pinia: Pinia
): Promise<void> {
  try {
    const result = await useChatStore(pinia).dispatchAppOwnedChatTurn(
      workspaceId,
      parentSessionId,
      (callbacks) =>
        workflowProposalApi.decisionDispatch(
          workspaceId,
          notificationId,
          parentSessionId,
          callbacks
        ),
      { settleOn: "terminal", acquireLocalTurn: "optional" }
    );
    if (result.status === "busy") scheduleDecisionRetry(workspaceId, pinia);
  } catch (error: unknown) {
    console.error(
      "Workflow proposal decision dispatch failed:",
      error instanceof Error ? error.message : String(error)
    );
  }
}

export async function drainWorkflowProposalDecisions(
  workspaceId: string,
  pinia: Pinia
): Promise<void> {
  const controller = controllerFor(pinia);
  if (controller.disposed) return;
  controller.requested = true;
  if (controller.inFlight) return controller.inFlight;

  const run = (async () => {
    while (controller.requested && !controller.disposed) {
      controller.requested = false;
      const workspaceStore = useWorkspaceStore(pinia);
      if (workspaceStore.currentWorkspace?.id !== workspaceId) return;

      const response = await workflowProposalApi.decisionList(workspaceId);
      if (!response.ok) throw new Error(response.error.message);

      const bySession = new Map<string, typeof response.data.decisions>();
      for (const decision of response.data.decisions) {
        const list = bySession.get(decision.parentSessionId) ?? [];
        list.push(decision);
        bySession.set(decision.parentSessionId, list);
      }

      await Promise.all(
        [...bySession.values()].map((decisions) =>
          decisions.reduce(
            (chain, decision) =>
              chain.then(() =>
                dispatchDecision(
                  workspaceId,
                  decision.notificationId,
                  decision.parentSessionId,
                  pinia
                )
              ),
            Promise.resolve()
          )
        )
      );
    }
  })().finally(() => {
    if (controller.inFlight === run) controller.inFlight = null;
  });
  controller.inFlight = run;
  return run;
}

export function registerWorkflowProposalWakeListener(pinia: Pinia): () => void {
  const workspaceStore = useWorkspaceStore(pinia);
  const workflowProposalStore = useWorkflowProposalStore(pinia);
  return workflowProposalApi.onWake((payload) => {
    if (workspaceStore.currentWorkspace?.id !== payload.workspaceId) return;
    void workflowProposalStore.handleWake(payload);
  });
}

export function registerWorkflowProposalDecisionWakeListener(pinia: Pinia): () => void {
  const controller = controllerFor(pinia);
  controller.disposed = false;
  const workspaceStore = useWorkspaceStore(pinia);
  const unsubscribe = workflowProposalApi.onDecisionWake(({ workspaceId }) => {
    if (workspaceStore.currentWorkspace?.id !== workspaceId) return;
    void drainWorkflowProposalDecisions(workspaceId, pinia).catch((error: unknown) => {
      console.error("Workflow proposal decision drain failed:", error);
    });
  });
  const workspaceId = workspaceStore.currentWorkspace?.id;
  if (workspaceId) {
    void drainWorkflowProposalDecisions(workspaceId, pinia).catch((error: unknown) => {
      console.error("Workflow proposal decision drain failed:", error);
    });
  }

  return () => {
    unsubscribe();
    controller.disposed = true;
    controller.requested = false;
    if (controller.timer) {
      clearTimeout(controller.timer);
      controller.timer = null;
    }
    controllers.delete(pinia);
  };
}
