import { IpcErrorCodes } from "@shared/constants/error-codes";
import type {
  WorkflowDecisionNotificationState,
  WorkflowProposalDecisionSummary,
} from "@shared/types/workflow";
import {
  claimWorkflowDecision,
  listPendingWorkflowDecisions,
  listWorkflowDecisions,
  setWorkflowDecisionNotificationState,
  type WorkflowDecisionRecord,
} from "@main/infra/storage/workflow-decision-store";
import { loadSessionMeta } from "@main/infra/storage/session-store";
import { sessionRegistry } from "@main/services/session/_public";
import logger from "@main/infra/logger";

export interface WorkflowDecisionServiceDependencies {
  listPending: typeof listPendingWorkflowDecisions;
  listAll: typeof listWorkflowDecisions;
  claim: typeof claimWorkflowDecision;
  setNotificationState: typeof setWorkflowDecisionNotificationState;
  loadSession: typeof loadSessionMeta;
  now: () => string;
  isTurnLive: (workspaceId: string, parentSessionId: string) => boolean;
}

const defaultDependencies: WorkflowDecisionServiceDependencies = {
  listPending: listPendingWorkflowDecisions,
  listAll: listWorkflowDecisions,
  claim: claimWorkflowDecision,
  setNotificationState: setWorkflowDecisionNotificationState,
  loadSession: loadSessionMeta,
  now: () => new Date().toISOString(),
  isTurnLive: (workspaceId, parentSessionId) =>
    sessionRegistry.get("chat", `${workspaceId}:${parentSessionId}`) !== undefined,
};

export type WorkflowDecisionWakeHandler = (workspaceId: string) => void | Promise<void>;

function toSummary(record: WorkflowDecisionRecord): WorkflowProposalDecisionSummary {
  return {
    notificationId: record.notification.notificationId,
    parentSessionId: record.parentSessionId,
    proposalId: record.proposalId,
    decision: record.decision,
    state: record.notification.state,
    decidedAt: record.decidedAt,
    updatedAt: record.updatedAt,
  };
}

function isTerminalState(state: WorkflowDecisionNotificationState): boolean {
  return state === "delivered" || state === "delivery_unknown" || state === "suppressed";
}

export class WorkflowDecisionService {
  private readonly dependencies: WorkflowDecisionServiceDependencies;
  private wakeHandler: WorkflowDecisionWakeHandler | null = null;
  private acceptingClaims = true;

  constructor(dependencies: Partial<WorkflowDecisionServiceDependencies> = {}) {
    this.dependencies = { ...defaultDependencies, ...dependencies };
  }

  setWakeHandler(handler: WorkflowDecisionWakeHandler | null): void {
    this.wakeHandler = handler;
  }

  beginShutdown(): void {
    this.acceptingClaims = false;
  }

  resetForTests(): void {
    this.acceptingClaims = true;
    this.wakeHandler = null;
  }

  async list(workspaceId: string): Promise<WorkflowProposalDecisionSummary[]> {
    const records = await this.dependencies.listPending(workspaceId);
    const summaries: WorkflowProposalDecisionSummary[] = [];
    for (const record of records) {
      if (!(await this.dependencies.loadSession(workspaceId, record.parentSessionId))) {
        await this.suppress(record);
        continue;
      }
      summaries.push(toSummary(record));
    }
    return summaries;
  }

  async claim(workspaceId: string, notificationId: string): Promise<WorkflowDecisionRecord | null> {
    if (!this.acceptingClaims) return null;
    const candidate = (await this.dependencies.listPending(workspaceId)).find(
      (record) => record.notification.notificationId === notificationId
    );
    if (!candidate) return null;
    if (!(await this.dependencies.loadSession(workspaceId, candidate.parentSessionId))) {
      await this.suppress(candidate);
      return null;
    }
    return this.dependencies.claim(workspaceId, notificationId, this.dependencies.now());
  }

  buildReminder(record: WorkflowDecisionRecord): string {
    if (record.decision !== "cancelled") {
      throw Object.assign(new Error("Workflow decision is not a cancellation"), {
        code: IpcErrorCodes.WORKFLOW_DECISION_INVALID_REQUEST,
      });
    }
    return [
      "<system-reminder>",
      "用户已取消一个 workflow 提案。",
      `proposalId=${record.proposalId}`,
      "该提案没有保存为正式 definition，也没有创建 Run。",
      "这是不可见的状态提醒，不要因为这条提醒启动新的 workflow。",
      "</system-reminder>",
    ].join("\n");
  }

  async markDelivered(record: WorkflowDecisionRecord): Promise<void> {
    await this.setFinalState(record, "delivered");
  }

  async markDeliveryUnknown(record: WorkflowDecisionRecord): Promise<void> {
    await this.setFinalState(record, "delivery_unknown");
  }

  async suppress(record: WorkflowDecisionRecord): Promise<void> {
    await this.setFinalState(record, "suppressed");
  }

  async reconcileWorkspace(workspaceId: string): Promise<void> {
    const records = await this.dependencies.listAll(workspaceId);
    for (const record of records) {
      if (
        record.notification.state === "dispatched" &&
        !this.dependencies.isTurnLive(workspaceId, record.parentSessionId)
      ) {
        await this.markDeliveryUnknown(record);
      }
    }
  }

  async suppressParent(workspaceId: string, parentSessionId: string): Promise<void> {
    const records = await this.dependencies.listAll(workspaceId);
    for (const record of records) {
      if (
        record.parentSessionId !== parentSessionId ||
        isTerminalState(record.notification.state)
      ) {
        continue;
      }
      await this.suppress(record);
    }
  }

  private async setFinalState(
    record: WorkflowDecisionRecord,
    state: Exclude<WorkflowDecisionNotificationState, "pending" | "dispatched">
  ): Promise<void> {
    try {
      await this.dependencies.setNotificationState(
        { workspaceId: record.workspaceId, parentSessionId: record.parentSessionId },
        record.proposalId,
        record.notification.notificationId,
        state,
        this.dependencies.now()
      );
      try {
        await this.wakeHandler?.(record.workspaceId);
      } catch (error: unknown) {
        logger.warn(
          `[workflow-decision] failed to send wake: ${record.notification.notificationId}`,
          error
        );
      }
    } catch (error: unknown) {
      logger.warn(
        `[workflow-decision] failed to set ${state}: ${record.notification.notificationId}`,
        error
      );
      throw error;
    }
  }
}

export const workflowDecisionService = new WorkflowDecisionService();
