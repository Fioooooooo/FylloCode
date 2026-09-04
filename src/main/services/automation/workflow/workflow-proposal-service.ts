import schemaMarkdown from "../../../../mcp-servers/fyllo-workflow/src/schema-docs/schema.md?raw";
import examplesMarkdown from "../../../../mcp-servers/fyllo-workflow/src/schema-docs/examples.md?raw";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import type {
  WorkflowProposalCancelResult,
  WorkflowProposalConfirmRequest,
  WorkflowProposalConfirmResult,
  WorkflowProposalDetail,
  WorkflowProposalDetailRequest,
  WorkflowProposalListRequest,
  WorkflowProposalListResult,
  WorkflowProposalMode,
  WorkflowProposalPersist,
  WorkflowProposalSummary,
  WorkflowProposalWakePayload,
} from "@shared/types/workflow";
import { parseWorkflowYaml } from "@main/domain/automation/workflow/yaml-parser";
import {
  validateProposeWorkflowInput,
  type WorkflowProposalValidationError,
} from "@main/domain/automation/workflow/proposal-validator";
import {
  newWorkflowDecisionNotificationId,
  newWorkflowId,
  newWorkflowProposalId,
} from "@main/infra/ids";
import {
  loadSessionWorkflowDefinition,
  loadWorkflowDefinition,
  saveSessionWorkflowDefinition,
  saveWorkflowDefinition,
} from "@main/infra/storage/workflow-definition-store";
import {
  loadWorkflowDecision,
  saveWorkflowDecision,
  type WorkflowDecisionRecord,
} from "@main/infra/storage/workflow-decision-store";
import {
  listWorkflowProposals,
  loadWorkflowProposal,
  saveWorkflowProposal,
  updateWorkflowProposalStatus,
  type WorkflowProposalRecord,
} from "@main/infra/storage/workflow-proposal-store";
import logger from "@main/infra/logger";

export interface WorkflowProposalCaller {
  callerType: "chat" | "workflow" | "spawned" | "unknown";
  workspaceId: string;
  parentSessionId: string;
}

export interface ProposeWorkflowRequest {
  yaml: string;
  persist: WorkflowProposalPersist;
  mode: WorkflowProposalMode;
  workflowId?: string;
  caller: WorkflowProposalCaller;
}

export interface WorkflowProposalServiceDependencies {
  saveProposal: typeof saveWorkflowProposal;
  loadProposal: typeof loadWorkflowProposal;
  listProposals: typeof listWorkflowProposals;
  updateProposalStatus: typeof updateWorkflowProposalStatus;
  loadSessionDefinition: typeof loadSessionWorkflowDefinition;
  loadWorkspaceDefinition: typeof loadWorkflowDefinition;
  saveSessionDefinition: typeof saveSessionWorkflowDefinition;
  saveWorkspaceDefinition: typeof saveWorkflowDefinition;
  loadDecision: typeof loadWorkflowDecision;
  saveDecision: typeof saveWorkflowDecision;
  createProposalId: typeof newWorkflowProposalId;
  createWorkflowId: typeof newWorkflowId;
  createDecisionNotificationId: typeof newWorkflowDecisionNotificationId;
  now: () => string;
}

const defaultDependencies: WorkflowProposalServiceDependencies = {
  saveProposal: saveWorkflowProposal,
  loadProposal: loadWorkflowProposal,
  listProposals: listWorkflowProposals,
  updateProposalStatus: updateWorkflowProposalStatus,
  loadSessionDefinition: loadSessionWorkflowDefinition,
  loadWorkspaceDefinition: loadWorkflowDefinition,
  saveSessionDefinition: saveSessionWorkflowDefinition,
  saveWorkspaceDefinition: saveWorkflowDefinition,
  loadDecision: loadWorkflowDecision,
  saveDecision: saveWorkflowDecision,
  createProposalId: newWorkflowProposalId,
  createWorkflowId: newWorkflowId,
  createDecisionNotificationId: newWorkflowDecisionNotificationId,
  now: () => new Date().toISOString(),
};

export type WorkflowProposalWakeHandler = (
  payload: WorkflowProposalWakePayload
) => void | Promise<void>;
export type WorkflowDecisionWakeHandler = (workspaceId: string) => void | Promise<void>;
export type WorkflowConfirmHandoffHandler = (
  record: WorkflowProposalRecord,
  workflowId: string,
  persist: WorkflowProposalPersist
) => boolean | Promise<boolean>;

interface ProposeWorkflowAccepted {
  status: "accepted";
  proposalId: string;
}

interface ProposeWorkflowRejected {
  status: "rejected";
  errors: WorkflowProposalValidationError[];
}

export type ProposeWorkflowResult = ProposeWorkflowAccepted | ProposeWorkflowRejected;

function proposalError(
  code: string,
  message: string,
  details: Record<string, unknown> = {}
): Error {
  return Object.assign(new Error(message), { code, details });
}

function toSummary(record: WorkflowProposalRecord): WorkflowProposalSummary {
  return { ...record.meta };
}

function isTerminalStatus(status: WorkflowProposalRecord["meta"]["status"]): boolean {
  return status === "confirmed" || status === "cancelled";
}

function confirmedResult(record: WorkflowProposalRecord): WorkflowProposalConfirmResult {
  if (record.meta.status === "cancelled") return { status: "cancelled" };
  if (!record.meta.resolvedWorkflowId || !record.meta.resolvedPersist) {
    throw proposalError(
      IpcErrorCodes.WORKFLOW_PROPOSAL_INVALID_STATE,
      `Confirmed Workflow proposal has no resolved definition: ${record.meta.proposalId}`
    );
  }
  return {
    status: "confirmed",
    workflowId: record.meta.resolvedWorkflowId,
    persist: record.meta.resolvedPersist,
  };
}

function terminalCancelResult(record: WorkflowProposalRecord): WorkflowProposalCancelResult {
  if (record.meta.status === "cancelled") return { status: "cancelled" };
  if (!record.meta.resolvedWorkflowId || !record.meta.resolvedPersist) {
    throw proposalError(
      IpcErrorCodes.WORKFLOW_PROPOSAL_INVALID_STATE,
      `Confirmed Workflow proposal has no resolved definition: ${record.meta.proposalId}`
    );
  }
  return {
    status: "confirmed",
    workflowId: record.meta.resolvedWorkflowId,
    persist: record.meta.resolvedPersist,
  };
}

function decisionRecord(
  workspaceId: string,
  parentSessionId: string,
  proposalId: string,
  notificationId: string,
  timestamp: string
): WorkflowDecisionRecord {
  return {
    version: 1,
    workspaceId,
    parentSessionId,
    proposalId,
    decision: "cancelled",
    notification: { notificationId, state: "pending", updatedAt: timestamp },
    decidedAt: timestamp,
    updatedAt: timestamp,
  };
}

export class WorkflowProposalService {
  private readonly dependencies: WorkflowProposalServiceDependencies;
  private readonly operationQueues = new Map<string, Promise<void>>();
  private wakeHandler: WorkflowProposalWakeHandler | null = null;
  private decisionWakeHandler: WorkflowDecisionWakeHandler | null = null;
  private handoffHandler: WorkflowConfirmHandoffHandler | null = null;

  constructor(dependencies: Partial<WorkflowProposalServiceDependencies> = {}) {
    this.dependencies = { ...defaultDependencies, ...dependencies };
  }

  setWakeHandler(handler: WorkflowProposalWakeHandler | null): void {
    this.wakeHandler = handler;
  }

  setDecisionWakeHandler(handler: WorkflowDecisionWakeHandler | null): void {
    this.decisionWakeHandler = handler;
  }

  setConfirmHandoffHandler(handler: WorkflowConfirmHandoffHandler | null): void {
    this.handoffHandler = handler;
  }

  describeWorkflowSchema(withExamples = false): { schema: string } {
    return {
      schema: withExamples
        ? `${schemaMarkdown.trimEnd()}\n\n${examplesMarkdown.trimStart()}`
        : schemaMarkdown,
    };
  }

  async proposeWorkflow(request: ProposeWorkflowRequest): Promise<ProposeWorkflowResult> {
    if (request.caller.callerType !== "chat") {
      throw proposalError(
        IpcErrorCodes.WORKFLOW_INVALID_CALLER,
        `Workflow proposal caller is not an allowed Chat owner: ${request.caller.callerType}`
      );
    }

    const targetSession = request.workflowId
      ? await this.dependencies.loadSessionDefinition(
          request.caller.workspaceId,
          request.caller.parentSessionId,
          request.workflowId
        )
      : null;
    const targetWorkspace = request.workflowId
      ? await this.dependencies.loadWorkspaceDefinition(
          request.caller.workspaceId,
          request.workflowId
        )
      : null;
    const validation = validateProposeWorkflowInput(
      {
        yaml: request.yaml,
        mode: request.mode,
        workflowId: request.workflowId,
        persist: request.persist,
      },
      {
        sessionWorkflowExists: targetSession !== null,
        workspaceWorkflowExists: targetWorkspace !== null,
      }
    );
    if (!validation.ok) return { status: "rejected", errors: validation.errors };

    let proposalId: string;
    do {
      proposalId = this.dependencies.createProposalId();
    } while (
      await this.dependencies.loadProposal(
        request.caller.workspaceId,
        request.caller.parentSessionId,
        proposalId
      )
    );

    const timestamp = this.dependencies.now();
    await this.dependencies.saveProposal({
      workspaceId: request.caller.workspaceId,
      parentSessionId: request.caller.parentSessionId,
      proposalId,
      yaml: request.yaml,
      mode: request.mode,
      ...(request.workflowId ? { targetWorkflowId: request.workflowId } : {}),
      suggestedPersist: request.persist,
      status: "pending",
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await this.emitProposalWake({
      workspaceId: request.caller.workspaceId,
      parentSessionId: request.caller.parentSessionId,
      proposalId,
    });
    return { status: "accepted", proposalId };
  }

  async listProposals(request: WorkflowProposalListRequest): Promise<WorkflowProposalListResult> {
    const records = await this.dependencies.listProposals(
      request.workspaceId,
      request.parentSessionId
    );
    return {
      proposals: records.map(toSummary).sort((left, right) => {
        const byUpdatedAt = right.updatedAt.localeCompare(left.updatedAt);
        return byUpdatedAt || left.proposalId.localeCompare(right.proposalId);
      }),
    };
  }

  async getProposalDetail(request: WorkflowProposalDetailRequest): Promise<WorkflowProposalDetail> {
    const record = await this.requireProposal(request);
    const definition = parseWorkflowYaml(record.yaml);
    let targetWorkflowName: string | undefined;
    if (record.meta.targetWorkflowId) {
      const target =
        (await this.dependencies.loadSessionDefinition(
          request.workspaceId,
          request.parentSessionId,
          record.meta.targetWorkflowId
        )) ??
        (await this.dependencies.loadWorkspaceDefinition(
          request.workspaceId,
          record.meta.targetWorkflowId
        ));
      if (target) targetWorkflowName = parseWorkflowYaml(target.yaml).name;
    }
    return {
      ...record.meta,
      yaml: record.yaml,
      definition,
      ...(targetWorkflowName ? { targetWorkflowName } : {}),
    };
  }

  async confirmProposal(
    request: WorkflowProposalConfirmRequest,
    handoffHandler?: WorkflowConfirmHandoffHandler | null
  ): Promise<WorkflowProposalConfirmResult> {
    return this.enqueue(request, async () => {
      const record = await this.requireProposal(request);
      if (isTerminalStatus(record.meta.status)) return confirmedResult(record);

      const confirming = await this.dependencies.updateProposalStatus(
        request.workspaceId,
        request.parentSessionId,
        request.proposalId,
        "confirming"
      );
      if (!confirming) throw this.notFound(request.proposalId);

      let workflowId: string;
      try {
        workflowId = await this.resolveWorkflowId(request, confirming);
        if (request.persist === "session") {
          await this.dependencies.saveSessionDefinition(
            request.workspaceId,
            request.parentSessionId,
            workflowId,
            confirming.yaml
          );
        } else {
          await this.dependencies.saveWorkspaceDefinition(
            request.workspaceId,
            workflowId,
            confirming.yaml
          );
        }
      } catch (error: unknown) {
        await this.resetPending(request).catch(() => undefined);
        throw this.asPersistError(error, request.proposalId);
      }

      const resolved = await this.dependencies.updateProposalStatus(
        request.workspaceId,
        request.parentSessionId,
        request.proposalId,
        "confirmed",
        {
          resolvedWorkflowId: workflowId,
          resolvedPersist: request.persist,
          handoffDelivered: false,
        }
      );
      if (!resolved) {
        await this.resetPending(request).catch(() => undefined);
        throw this.asPersistError(
          new Error("Workflow proposal metadata could not be updated"),
          request.proposalId
        );
      }

      let handoffDelivered = false;
      const effectiveHandoffHandler =
        handoffHandler === undefined ? this.handoffHandler : handoffHandler;
      if (effectiveHandoffHandler) {
        try {
          handoffDelivered = await effectiveHandoffHandler(resolved, workflowId, request.persist);
        } catch (error: unknown) {
          logger.warn(`[workflow-proposal] confirm handoff failed: ${request.proposalId}`, error);
        }
      }
      try {
        const finalized = await this.dependencies.updateProposalStatus(
          request.workspaceId,
          request.parentSessionId,
          request.proposalId,
          "confirmed",
          { handoffDelivered }
        );
        if (!finalized) {
          throw new Error("Workflow proposal metadata could not be finalized");
        }
      } catch (error: unknown) {
        await this.resetPending(request).catch(() => undefined);
        throw this.asPersistError(error, request.proposalId);
      }
      return { status: "confirmed", workflowId, persist: request.persist };
    });
  }

  async cancelProposal(
    request: WorkflowProposalDetailRequest
  ): Promise<WorkflowProposalCancelResult> {
    return this.enqueue(request, async () => {
      const record = await this.requireProposal(request);
      if (isTerminalStatus(record.meta.status)) return terminalCancelResult(record);

      const timestamp = this.dependencies.now();
      const existingDecision = await this.dependencies.loadDecision(
        request.workspaceId,
        request.parentSessionId,
        request.proposalId
      );
      const decision =
        existingDecision ??
        decisionRecord(
          request.workspaceId,
          request.parentSessionId,
          request.proposalId,
          this.dependencies.createDecisionNotificationId(),
          timestamp
        );
      await this.dependencies.saveDecision(decision);
      const cancelled = await this.dependencies.updateProposalStatus(
        request.workspaceId,
        request.parentSessionId,
        request.proposalId,
        "cancelled"
      );
      if (!cancelled) throw this.notFound(request.proposalId);
      await this.emitDecisionWake(request.workspaceId);
      return { status: "cancelled" };
    });
  }

  private async resolveWorkflowId(
    request: WorkflowProposalConfirmRequest,
    record: WorkflowProposalRecord
  ): Promise<string> {
    if (record.meta.mode === "update") {
      const workflowId = record.meta.targetWorkflowId;
      if (!workflowId) {
        throw proposalError(
          IpcErrorCodes.WORKFLOW_PROPOSAL_INVALID_STATE,
          `Update proposal has no target workflow: ${record.meta.proposalId}`
        );
      }
      if (request.persist === "workspace") {
        const formal = await this.dependencies.loadWorkspaceDefinition(
          request.workspaceId,
          workflowId
        );
        if (!formal) {
          throw proposalError(
            IpcErrorCodes.WORKFLOW_PROPOSAL_TARGET_NOT_UPGRADABLE,
            `Session shadow Workflow cannot be promoted to Workspace asset: ${workflowId}`,
            { workflowId, proposalId: record.meta.proposalId }
          );
        }
      } else {
        const sessionTarget = await this.dependencies.loadSessionDefinition(
          request.workspaceId,
          request.parentSessionId,
          workflowId
        );
        const workspaceTarget = await this.dependencies.loadWorkspaceDefinition(
          request.workspaceId,
          workflowId
        );
        if (!sessionTarget && !workspaceTarget) {
          throw proposalError(
            IpcErrorCodes.WORKFLOW_NOT_FOUND,
            `Workflow target no longer exists: ${workflowId}`,
            { workflowId, proposalId: record.meta.proposalId }
          );
        }
      }
      return workflowId;
    }

    let workflowId = "";
    let targetExists = true;
    while (targetExists) {
      workflowId = this.dependencies.createWorkflowId();
      const [sessionTarget, workspaceTarget] = await Promise.all([
        this.dependencies.loadSessionDefinition(
          request.workspaceId,
          request.parentSessionId,
          workflowId
        ),
        this.dependencies.loadWorkspaceDefinition(request.workspaceId, workflowId),
      ]);
      targetExists = Boolean(sessionTarget || workspaceTarget);
    }
    return workflowId;
  }

  private async requireProposal(
    request: WorkflowProposalDetailRequest
  ): Promise<WorkflowProposalRecord> {
    const record = await this.dependencies.loadProposal(
      request.workspaceId,
      request.parentSessionId,
      request.proposalId
    );
    if (!record) throw this.notFound(request.proposalId);
    return record;
  }

  private notFound(proposalId: string): Error {
    return proposalError(
      IpcErrorCodes.WORKFLOW_PROPOSAL_NOT_FOUND,
      `Workflow proposal not found: ${proposalId}`,
      { proposalId }
    );
  }

  private asPersistError(error: unknown, proposalId: string): Error {
    if (error && typeof error === "object" && "code" in error) {
      const code = (error as { code?: unknown }).code;
      if (code === IpcErrorCodes.WORKFLOW_PROPOSAL_TARGET_NOT_UPGRADABLE) {
        return error as unknown as Error;
      }
    }
    return proposalError(
      IpcErrorCodes.WORKFLOW_PROPOSAL_PERSIST_FAILED,
      `Workflow proposal could not be confirmed: ${
        error instanceof Error ? error.message : String(error)
      }`,
      { proposalId }
    );
  }

  private async resetPending(request: WorkflowProposalDetailRequest): Promise<void> {
    await this.dependencies.updateProposalStatus(
      request.workspaceId,
      request.parentSessionId,
      request.proposalId,
      "pending",
      { handoffDelivered: undefined, resolvedWorkflowId: undefined, resolvedPersist: undefined }
    );
  }

  private enqueue<T>(request: WorkflowProposalDetailRequest, task: () => Promise<T>): Promise<T> {
    const key = `${request.workspaceId}\0${request.parentSessionId}\0${request.proposalId}`;
    const previous = this.operationQueues.get(key) ?? Promise.resolve();
    const operation = previous.then(task);
    const tail = operation.then(
      () => undefined,
      () => undefined
    );
    this.operationQueues.set(key, tail);
    return operation.finally(() => {
      if (this.operationQueues.get(key) === tail) this.operationQueues.delete(key);
    });
  }

  private async emitProposalWake(payload: WorkflowProposalWakePayload): Promise<void> {
    try {
      await this.wakeHandler?.(payload);
    } catch (error: unknown) {
      logger.warn(`[workflow-proposal] failed to send wake: ${payload.proposalId}`, error);
    }
  }

  private async emitDecisionWake(workspaceId: string): Promise<void> {
    try {
      await this.decisionWakeHandler?.(workspaceId);
    } catch (error: unknown) {
      logger.warn(`[workflow-proposal] failed to send decision wake: ${workspaceId}`, error);
    }
  }
}

export const workflowProposalService = new WorkflowProposalService();
