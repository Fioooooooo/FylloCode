import { IpcErrorCodes } from "@shared/constants/error-codes";
import type {
  WorkflowRunDetail,
  WorkflowRunDetailRequest,
  WorkflowRunError,
  WorkflowRunListResult,
  WorkflowRunSnapshot,
  WorkflowRunSummary,
  WorkflowRunWakePayload,
} from "@shared/types/workflow";
import { advance, type WorkflowAdvanceEvent } from "@main/domain/automation/workflow/state-machine";
import { preflightWorkflowDefinition } from "@main/domain/automation/workflow/preflight";
import {
  validateWorkflowDefinition,
  WorkflowDefinitionValidationError,
} from "@main/domain/automation/workflow/yaml-parser";
import {
  loadSessionWorkflowDefinition as loadSessionDefinitionService,
  loadWorkflowDefinition as loadDefinitionService,
} from "./workflow-service";
import {
  appendWorkflowRunTranscript,
  listWorkflowRunSnapshotEntries,
  listWorkflowRunSnapshots,
  loadWorkflowRunSnapshot,
  readWorkflowRunTranscript,
  saveWorkflowRunSnapshot,
  type WorkflowRunOwner,
} from "@main/infra/storage/workflow-run-store";
import { newRunId } from "@main/infra/ids";
import logger from "@main/infra/logger";

export type WorkflowCallerType = "chat" | "workflow" | "spawned" | "unknown";

/**
 * 由 Main 的可信 bundled MCP handler 组装的 caller 上下文。
 * workflowId 是唯一由 tool 参数提供的字段；parentSessionId 不从 agent 请求体读取。
 */
export interface WorkflowCallerContext {
  callerType: WorkflowCallerType;
  workspaceId: string;
  parentSessionId: string;
}

export interface WorkflowTriggerRequest {
  workflowId: string;
  caller: WorkflowCallerContext;
}

export interface WorkflowTriggerResult {
  status: "accepted";
  runId: string;
  runStatus: WorkflowRunSnapshot["status"];
}

export interface WorkflowEngineDependencies {
  loadDefinition: typeof loadDefinitionService;
  loadSessionDefinition: typeof loadSessionDefinitionService;
  listRunSnapshots: typeof listWorkflowRunSnapshots;
  listRunEntries: typeof listWorkflowRunSnapshotEntries;
  loadRunSnapshot: typeof loadWorkflowRunSnapshot;
  saveRunSnapshot: typeof saveWorkflowRunSnapshot;
  readTranscript: typeof readWorkflowRunTranscript;
  appendTranscript: typeof appendWorkflowRunTranscript;
  createRunId: typeof newRunId;
  now: () => string;
  wake: (payload: WorkflowRunWakePayload) => void | Promise<void>;
  onStageReady?: (owner: WorkflowRunOwner, snapshot: WorkflowRunSnapshot) => void | Promise<void>;
  cancelRunResources?: (owner: WorkflowRunOwner) => void | Promise<void>;
  hasLiveRunHandle?: (
    owner: WorkflowRunOwner,
    snapshot: WorkflowRunSnapshot
  ) => boolean | Promise<boolean>;
}

export interface WorkflowEngineExecutionHooks {
  onStageReady?: (owner: WorkflowRunOwner, snapshot: WorkflowRunSnapshot) => void | Promise<void>;
  cancelRunResources?: (owner: WorkflowRunOwner) => void | Promise<void>;
}

export type WorkflowRunWakeHandler = (payload: WorkflowRunWakePayload) => void | Promise<void>;

export interface WorkflowReconcileResult {
  recovered: string[];
  interrupted: string[];
  incompatible: string[];
  skipped: string[];
  errors: Array<{ runId: string; message: string }>;
}

const defaultDependencies: WorkflowEngineDependencies = {
  loadDefinition: loadDefinitionService,
  loadSessionDefinition: loadSessionDefinitionService,
  listRunSnapshots: listWorkflowRunSnapshots,
  listRunEntries: listWorkflowRunSnapshotEntries,
  loadRunSnapshot: loadWorkflowRunSnapshot,
  saveRunSnapshot: saveWorkflowRunSnapshot,
  readTranscript: readWorkflowRunTranscript,
  appendTranscript: appendWorkflowRunTranscript,
  createRunId: newRunId,
  now: () => new Date().toISOString(),
  wake: () => undefined,
};

const RUN_STATUSES = new Set<WorkflowRunSnapshot["status"]>([
  "awaiting_start_confirmation",
  "running",
  "awaiting_gate_decision",
  "awaiting_action_confirmation",
  "succeeded",
  "failed",
  "cancelled",
  "interrupted",
]);

export type WorkflowEngineErrorCode =
  | typeof IpcErrorCodes.WORKFLOW_NOT_FOUND
  | typeof IpcErrorCodes.WORKFLOW_RUN_NOT_FOUND
  | typeof IpcErrorCodes.WORKFLOW_RUN_CONFLICT
  | typeof IpcErrorCodes.WORKFLOW_RUN_PERSIST_FAILED
  | typeof IpcErrorCodes.WORKFLOW_INVALID_CALLER
  | typeof IpcErrorCodes.WORKFLOW_ENGINE_SHUTTING_DOWN
  | typeof IpcErrorCodes.VALIDATION_ERROR;

export class WorkflowEngineError extends Error {
  readonly code: WorkflowEngineErrorCode;
  readonly details: Record<string, unknown>;

  constructor(
    code: WorkflowEngineErrorCode,
    message: string,
    details: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = "WorkflowEngineError";
    this.code = code;
    this.details = details;
  }
}

interface KnownRun {
  owner: WorkflowRunOwner;
  snapshot: WorkflowRunSnapshot;
}

type AsyncTask<T> = () => Promise<T>;

function isActiveStatus(status: WorkflowRunSnapshot["status"]): boolean {
  return (
    status === "awaiting_start_confirmation" ||
    status === "running" ||
    status === "awaiting_gate_decision" ||
    status === "awaiting_action_confirmation"
  );
}

function parentKey(workspaceId: string, parentSessionId: string): string {
  return `${workspaceId}\0${parentSessionId}`;
}

function toSummary(snapshot: WorkflowRunSnapshot): WorkflowRunSummary {
  return {
    runId: snapshot.runId,
    workflowId: snapshot.workflowId,
    workflowName: snapshot.frozenDefinition.name,
    parentSessionId: snapshot.parentSessionId,
    status: snapshot.status,
    currentStageId: snapshot.currentStageId,
    ...(snapshot.pendingDecision ? { pendingDecision: snapshot.pendingDecision } : {}),
    ...(snapshot.error ? { error: snapshot.error } : {}),
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.updatedAt,
  };
}

function removePending(
  snapshot: WorkflowRunSnapshot
): Omit<WorkflowRunSnapshot, "pendingDecision"> {
  const { pendingDecision, ...rest } = snapshot;
  void pendingDecision;
  return rest;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validatePersistedSnapshot(value: WorkflowRunSnapshot): WorkflowRunError | null {
  if (
    !isRecord(value) ||
    value.snapshotSchemaVersion !== 1 ||
    typeof value.runId !== "string" ||
    typeof value.workflowId !== "string" ||
    typeof value.parentSessionId !== "string" ||
    typeof value.currentStageId !== "string" ||
    typeof value.createdAt !== "string" ||
    typeof value.updatedAt !== "string" ||
    !RUN_STATUSES.has(value.status) ||
    !isRecord(value.visitCounts) ||
    !isRecord(value.artifacts)
  ) {
    return {
      code: "WORKFLOW_SNAPSHOT_INCOMPATIBLE",
      message: "Workflow Run snapshot shape or schema version is incompatible",
    };
  }

  let definition;
  try {
    definition = validateWorkflowDefinition(value.frozenDefinition);
  } catch (error: unknown) {
    const message =
      error instanceof WorkflowDefinitionValidationError ? error.message : toErrorMessage(error);
    return {
      code: "WORKFLOW_DEFINITION_INCOMPATIBLE",
      message: `Inline Workflow definition is incompatible: ${message}`,
      feature: "frozenDefinition",
    };
  }

  if (!definition.stages.some((stage) => stage.id === value.currentStageId)) {
    return {
      code: "WORKFLOW_SNAPSHOT_INCOMPATIBLE",
      message: `Current stage is not present in the frozen Workflow definition: ${value.currentStageId}`,
      stageId: value.currentStageId,
    };
  }
  return null;
}

export class WorkflowEngine {
  private readonly dependencies: WorkflowEngineDependencies;
  private readonly knownRuns = new Map<string, KnownRun>();
  private readonly activeByParent = new Map<string, string>();
  private readonly runQueues = new Map<string, Promise<void>>();
  private readonly parentQueues = new Map<string, Promise<void>>();
  private stageReadyHandler:
    ((owner: WorkflowRunOwner, snapshot: WorkflowRunSnapshot) => void | Promise<void>) | undefined;
  private cancelRunResourcesHandler:
    ((owner: WorkflowRunOwner) => void | Promise<void>) | undefined;
  private wakeHandler: WorkflowRunWakeHandler;
  private shuttingDown = false;
  private disposed = false;

  constructor(dependencies: Partial<WorkflowEngineDependencies> = {}) {
    this.dependencies = { ...defaultDependencies, ...dependencies };
    this.stageReadyHandler = this.dependencies.onStageReady;
    this.cancelRunResourcesHandler = this.dependencies.cancelRunResources;
    this.wakeHandler = this.dependencies.wake;
  }

  configureExecutionHooks(hooks: WorkflowEngineExecutionHooks): void {
    if (hooks.onStageReady) {
      const nextStageReadyHandler = hooks.onStageReady;
      const previousStageReadyHandler = this.stageReadyHandler;
      this.stageReadyHandler = previousStageReadyHandler
        ? async (owner, snapshot) => {
            await Promise.all([
              previousStageReadyHandler(owner, snapshot),
              nextStageReadyHandler(owner, snapshot),
            ]);
          }
        : nextStageReadyHandler;
    }
    if (hooks.cancelRunResources) {
      const nextCancelHandler = hooks.cancelRunResources;
      const previousCancelHandler = this.cancelRunResourcesHandler;
      this.cancelRunResourcesHandler = previousCancelHandler
        ? async (owner) => {
            await Promise.all([previousCancelHandler(owner), nextCancelHandler(owner)]);
          }
        : nextCancelHandler;
    }
  }

  setWakeHandler(handler: WorkflowRunWakeHandler | null): void {
    this.wakeHandler = handler ?? this.dependencies.wake;
  }

  /**
   * 建立唯一的 Workflow Run owner。外部只可通过这个入口触发，不接受 caller 自报 parent。
   */
  async triggerWorkflow(request: WorkflowTriggerRequest): Promise<WorkflowTriggerResult> {
    this.assertAvailable();
    this.assertCaller(request.caller);
    const { workspaceId, parentSessionId } = request.caller;
    const key = parentKey(workspaceId, parentSessionId);
    return this.enqueue(this.parentQueues, key, async () => {
      this.assertAvailable();
      const existing = await this.findActiveRun(workspaceId, parentSessionId);
      if (existing) {
        throw new WorkflowEngineError(
          IpcErrorCodes.WORKFLOW_RUN_CONFLICT,
          `Parent Session already has an active workflow Run: ${existing.snapshot.runId}`,
          {
            workspaceId,
            parentSessionId,
            runId: existing.snapshot.runId,
            workflowId: existing.snapshot.workflowId,
          }
        );
      }

      const sessionDefinitionRecord = await this.dependencies.loadSessionDefinition(
        workspaceId,
        parentSessionId,
        request.workflowId
      );
      const definitionRecord =
        sessionDefinitionRecord ??
        (await this.dependencies.loadDefinition(workspaceId, request.workflowId));
      if (!definitionRecord) {
        throw new WorkflowEngineError(
          IpcErrorCodes.WORKFLOW_NOT_FOUND,
          `Workflow not found: ${request.workflowId}`,
          { workspaceId, workflowId: request.workflowId }
        );
      }
      preflightWorkflowDefinition(definitionRecord.definition);

      const runId = this.dependencies.createRunId();
      const timestamp = this.dependencies.now();
      const firstStage = definitionRecord.definition.stages[0];
      const owner: WorkflowRunOwner = {
        workspaceId,
        workflowId: definitionRecord.workflowId,
        runId,
        parentSessionId,
      };
      const snapshot: WorkflowRunSnapshot = {
        snapshotSchemaVersion: 1,
        runId,
        workflowId: definitionRecord.workflowId,
        parentSessionId,
        frozenDefinition: structuredClone(definitionRecord.definition),
        definitionSource: sessionDefinitionRecord ? "session" : "workspace",
        status: definitionRecord.definition.confirmStart
          ? "awaiting_start_confirmation"
          : "running",
        currentStageId: firstStage.id,
        visitCounts: { [firstStage.id]: 1 },
        artifacts: {},
        ...(definitionRecord.definition.confirmStart
          ? {
              pendingDecision: {
                kind: "start" as const,
                prompt: `确认启动 Workflow：${definitionRecord.definition.name}`,
              },
            }
          : {}),
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      await this.persistNewSnapshot(owner, snapshot);
      this.remember({ owner, snapshot });
      await this.emitWake(owner, snapshot);
      if (snapshot.status === "running") this.scheduleStageReady(owner, snapshot);
      return { status: "accepted", runId, runStatus: snapshot.status };
    });
  }

  async listRuns(request: {
    workspaceId: string;
    parentSessionId: string;
  }): Promise<WorkflowRunListResult> {
    const entries = await this.dependencies.listRunSnapshots(
      request.workspaceId,
      request.parentSessionId
    );
    for (const entry of entries) this.remember(entry);
    return {
      runs: entries
        .map(({ snapshot }) => toSummary(snapshot))
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    };
  }

  async reconcile(workspaceId: string): Promise<WorkflowReconcileResult> {
    this.assertAvailable();
    const result: WorkflowReconcileResult = {
      recovered: [],
      interrupted: [],
      incompatible: [],
      skipped: [],
      errors: [],
    };
    const entries = await this.dependencies.listRunEntries(workspaceId);
    for (const entry of entries) {
      if (!entry.snapshot) {
        result.skipped.push(entry.owner.runId);
        logger.warn(
          `[workflow] Skipping unreadable Run snapshot: ${entry.owner.runId}`,
          entry.error
        );
        continue;
      }

      const owner: WorkflowRunOwner = {
        workspaceId,
        workflowId: entry.owner.workflowId,
        runId: entry.owner.runId,
        parentSessionId: entry.snapshot.parentSessionId,
      };
      const compatibilityError = validatePersistedSnapshot(entry.snapshot);
      if (compatibilityError) {
        const next = this.interruptedSnapshot(
          entry.snapshot,
          compatibilityError.code,
          compatibilityError.message,
          compatibilityError
        );
        try {
          await this.persistSnapshot(owner, next);
          this.remember({ owner, snapshot: next });
          await this.emitWake(owner, next);
          result.incompatible.push(owner.runId);
        } catch (error: unknown) {
          result.errors.push({ runId: owner.runId, message: toErrorMessage(error) });
          logger.warn(
            `[workflow] Failed to persist incompatible Run snapshot: ${owner.runId}`,
            error
          );
        }
        continue;
      }

      if (entry.snapshot.status === "running") {
        const hasLiveHandle = await this.dependencies.hasLiveRunHandle?.(owner, entry.snapshot);
        if (!hasLiveHandle) {
          const next = this.interruptedSnapshot(
            entry.snapshot,
            "APP_RESTARTED",
            "Workflow Run was interrupted because no live execution handle was restored"
          );
          try {
            await this.persistSnapshot(owner, next);
            this.remember({ owner, snapshot: next });
            await this.emitWake(owner, next);
            result.interrupted.push(owner.runId);
          } catch (error: unknown) {
            result.errors.push({ runId: owner.runId, message: toErrorMessage(error) });
            logger.warn(
              `[workflow] Failed to persist interrupted Run snapshot: ${owner.runId}`,
              error
            );
          }
          continue;
        }
      }

      this.remember({ owner, snapshot: entry.snapshot });
      result.recovered.push(owner.runId);
    }
    return result;
  }

  async reconcileWorkspaces(workspaceIds: readonly string[]): Promise<WorkflowReconcileResult> {
    const aggregate: WorkflowReconcileResult = {
      recovered: [],
      interrupted: [],
      incompatible: [],
      skipped: [],
      errors: [],
    };
    for (const workspaceId of workspaceIds) {
      const result = await this.reconcile(workspaceId);
      aggregate.recovered.push(...result.recovered);
      aggregate.interrupted.push(...result.interrupted);
      aggregate.incompatible.push(...result.incompatible);
      aggregate.skipped.push(...result.skipped);
      aggregate.errors.push(...result.errors);
    }
    return aggregate;
  }

  async getRunDetail(request: WorkflowRunDetailRequest): Promise<WorkflowRunDetail> {
    const owner = await this.resolveOwner(
      request.workspaceId,
      request.parentSessionId,
      request.runId
    );
    const snapshot = await this.loadOwnedSnapshot(owner);
    const transcript = snapshot.agentSessionState?.sessionId
      ? await this.dependencies.readTranscript(owner, snapshot.agentSessionState.sessionId)
      : undefined;
    return {
      ...toSummary(snapshot),
      visitCounts: snapshot.visitCounts,
      artifacts: snapshot.artifacts,
      ...(snapshot.agentSessionState ? { agentSessionState: snapshot.agentSessionState } : {}),
      ...(snapshot.actionState ? { actionState: snapshot.actionState } : {}),
      ...(transcript === undefined ? {} : { transcript }),
    };
  }

  async decideRun(
    request: WorkflowRunDetailRequest & { decision: "approve" | "reject" }
  ): Promise<WorkflowRunDetail> {
    const owner = await this.resolveOwner(
      request.workspaceId,
      request.parentSessionId,
      request.runId
    );
    const snapshot = await this.loadOwnedSnapshot(owner);
    const pendingKind = snapshot.pendingDecision?.kind;
    if (!pendingKind) {
      throw new WorkflowEngineError(
        IpcErrorCodes.VALIDATION_ERROR,
        `Workflow Run has no pending decision: ${request.runId}`,
        { runId: request.runId, status: snapshot.status }
      );
    }
    const event: WorkflowAdvanceEvent =
      pendingKind === "start"
        ? { type: request.decision === "approve" ? "start-approved" : "start-rejected" }
        : pendingKind === "action"
          ? {
              type: request.decision === "approve" ? "action-approved" : "action-rejected",
            }
          : { type: "gate-decision", decision: request.decision };
    return this.advanceRun(owner, event);
  }

  async advanceRun(
    owner: WorkflowRunOwner,
    event: WorkflowAdvanceEvent
  ): Promise<WorkflowRunDetail> {
    logger.info(`[workflow-engine] advanceRun: runId=${owner.runId}, event.type=${event.type}`);
    return this.enqueue(this.runQueues, owner.runId, async () => {
      this.assertAvailableForEvent(event);
      const current = await this.loadOwnedSnapshot(owner);
      logger.info(
        `[workflow-engine] before advance: status=${current.status}, stageId=${current.currentStageId}, visitCounts=${JSON.stringify(current.visitCounts)}`
      );
      const next = advance(current, event);
      logger.info(
        `[workflow-engine] after advance: status=${next.status}, stageId=${next.currentStageId}, visitCounts=${JSON.stringify(next.visitCounts)}, error=${next.error?.code}`
      );
      await this.persistSnapshot(owner, next);
      this.remember({ owner, snapshot: next });
      await this.emitWake(owner, next);
      if (this.shouldStartStage(current, next)) this.scheduleStageReady(owner, next);
      return this.toDetail(owner, next);
    });
  }

  async updateRun(
    owner: WorkflowRunOwner,
    updater: (snapshot: WorkflowRunSnapshot) => WorkflowRunSnapshot | null
  ): Promise<WorkflowRunSnapshot | null> {
    return this.enqueue(this.runQueues, owner.runId, async () => {
      this.assertAvailable();
      const current = await this.loadOwnedSnapshot(owner);
      const next = updater(structuredClone(current));
      if (!next) return null;
      await this.persistSnapshot(owner, next);
      this.remember({ owner, snapshot: next });
      await this.emitWake(owner, next);
      if (this.shouldStartStage(current, next)) this.scheduleStageReady(owner, next);
      return next;
    });
  }

  async appendTranscript(
    owner: WorkflowRunOwner,
    sessionId: string,
    line: string | unknown
  ): Promise<void> {
    await this.dependencies.appendTranscript(owner, sessionId, line);
  }

  async cancelRunsByParentSession(workspaceId: string, parentSessionId: string): Promise<void> {
    const entries = await this.dependencies.listRunSnapshots(workspaceId, parentSessionId);
    const active = entries.filter(({ snapshot }) => isActiveStatus(snapshot.status));
    await Promise.all(
      active.map(async ({ owner, snapshot }) => {
        this.remember({ owner, snapshot });
        await this.enqueue(this.runQueues, owner.runId, async () => {
          const current = await this.loadOwnedSnapshot(owner);
          if (!isActiveStatus(current.status)) return;
          await this.cancelResources(owner);
          const next = advance(current, {
            type: "cancel",
            reason: "Parent Session was deleted",
          });
          await this.persistSnapshot(owner, next);
          this.remember({ owner, snapshot: next });
          await this.emitWake(owner, next);
        });
      })
    );
  }

  beginShutdown(): void {
    if (this.shuttingDown) return;
    this.shuttingDown = true;
    for (const { owner, snapshot } of this.knownRuns.values()) {
      if (isActiveStatus(snapshot.status)) void this.cancelResources(owner);
    }
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.beginShutdown();
    const owners = [...this.knownRuns.values()].filter(({ snapshot }) =>
      isActiveStatus(snapshot.status)
    );
    await Promise.allSettled(
      owners.map(({ owner, snapshot }) =>
        this.enqueue(this.runQueues, owner.runId, async () => {
          const current = await this.loadOwnedSnapshot(owner).catch(() => snapshot);
          if (!isActiveStatus(current.status)) return;
          await this.cancelResources(owner);
          const next = this.interruptedSnapshot(current, "APP_SHUTDOWN");
          await this.persistSnapshot(owner, next);
          this.remember({ owner, snapshot: next });
          await this.emitWake(owner, next);
        })
      )
    );
    await Promise.all([...this.runQueues.values()]);
    this.knownRuns.clear();
    this.activeByParent.clear();
    this.disposed = true;
  }

  /** Emergency path: start best-effort persistence without accepting new work. */
  forceDispose(): void {
    if (this.disposed) return;
    this.beginShutdown();
    void this.dispose().catch((error: unknown) => {
      logger.warn("[workflow] force dispose could not persist every Run", error);
      this.knownRuns.clear();
      this.activeByParent.clear();
      this.disposed = true;
    });
  }

  private assertAvailable(): void {
    if (this.shuttingDown || this.disposed) {
      throw new WorkflowEngineError(
        IpcErrorCodes.WORKFLOW_ENGINE_SHUTTING_DOWN,
        "Workflow Engine is shutting down"
      );
    }
  }

  private assertAvailableForEvent(event: WorkflowAdvanceEvent): void {
    if (event.type === "cancel" || event.type === "error") return;
    this.assertAvailable();
  }

  private assertCaller(caller: WorkflowCallerContext): void {
    if (
      caller.callerType !== "chat" ||
      caller.workspaceId.trim() === "" ||
      caller.parentSessionId.trim() === ""
    ) {
      throw new WorkflowEngineError(
        IpcErrorCodes.WORKFLOW_INVALID_CALLER,
        `Workflow trigger caller is not an allowed chat owner: ${caller.callerType}`,
        {
          callerType: caller.callerType,
          workspaceId: caller.workspaceId,
          parentSessionId: caller.parentSessionId,
          allowedCallerTypes: ["chat"],
        }
      );
    }
  }

  private async findActiveRun(
    workspaceId: string,
    parentSessionId: string
  ): Promise<KnownRun | null> {
    const key = parentKey(workspaceId, parentSessionId);
    const knownRunId = this.activeByParent.get(key);
    if (knownRunId) {
      const known = this.knownRuns.get(knownRunId);
      if (known && isActiveStatus(known.snapshot.status)) return known;
      this.activeByParent.delete(key);
    }
    const persisted = await this.dependencies.listRunSnapshots(workspaceId, parentSessionId);
    for (const entry of persisted) {
      this.remember(entry);
      if (isActiveStatus(entry.snapshot.status)) return entry;
    }
    return null;
  }

  private async resolveOwner(
    workspaceId: string,
    parentSessionId: string,
    runId: string
  ): Promise<WorkflowRunOwner> {
    const known = this.knownRuns.get(runId);
    if (known) {
      if (
        known.owner.workspaceId !== workspaceId ||
        known.owner.parentSessionId !== parentSessionId
      ) {
        throw this.runNotFound(workspaceId, parentSessionId, runId);
      }
      return known.owner;
    }
    const entries = await this.dependencies.listRunEntries(workspaceId);
    const matching = entries.find(
      (entry) =>
        entry.snapshot?.runId === runId && entry.snapshot.parentSessionId === parentSessionId
    );
    if (!matching?.snapshot || !matching.owner.parentSessionId) {
      throw this.runNotFound(workspaceId, parentSessionId, runId);
    }
    const owner: WorkflowRunOwner = {
      workspaceId,
      workflowId: matching.snapshot.workflowId,
      runId,
      parentSessionId,
    };
    this.remember({ owner, snapshot: matching.snapshot });
    return owner;
  }

  private async loadOwnedSnapshot(owner: WorkflowRunOwner): Promise<WorkflowRunSnapshot> {
    const snapshot = await this.dependencies.loadRunSnapshot(owner);
    if (!snapshot) throw this.runNotFound(owner.workspaceId, owner.parentSessionId, owner.runId);
    if (
      snapshot.workflowId !== owner.workflowId ||
      snapshot.runId !== owner.runId ||
      snapshot.parentSessionId !== owner.parentSessionId
    ) {
      throw new WorkflowEngineError(
        IpcErrorCodes.WORKFLOW_RUN_NOT_FOUND,
        `Workflow Run owner mismatch: ${owner.runId}`,
        {
          workspaceId: owner.workspaceId,
          parentSessionId: owner.parentSessionId,
          runId: owner.runId,
        }
      );
    }
    return snapshot;
  }

  private runNotFound(
    workspaceId: string,
    parentSessionId: string,
    runId: string
  ): WorkflowEngineError {
    return new WorkflowEngineError(
      IpcErrorCodes.WORKFLOW_RUN_NOT_FOUND,
      `Workflow Run not found: ${runId}`,
      { workspaceId, parentSessionId, runId }
    );
  }

  private async persistNewSnapshot(
    owner: WorkflowRunOwner,
    snapshot: WorkflowRunSnapshot
  ): Promise<void> {
    try {
      await this.dependencies.saveRunSnapshot(owner, snapshot);
    } catch (error: unknown) {
      throw new WorkflowEngineError(
        IpcErrorCodes.WORKFLOW_RUN_PERSIST_FAILED,
        `Workflow Run snapshot could not be persisted: ${toErrorMessage(error)}`,
        { workspaceId: owner.workspaceId, workflowId: owner.workflowId, runId: owner.runId }
      );
    }
  }

  private async persistSnapshot(
    owner: WorkflowRunOwner,
    snapshot: WorkflowRunSnapshot
  ): Promise<void> {
    try {
      await this.dependencies.saveRunSnapshot(owner, snapshot);
    } catch (error: unknown) {
      throw new WorkflowEngineError(
        IpcErrorCodes.WORKFLOW_RUN_PERSIST_FAILED,
        `Workflow Run snapshot could not be persisted: ${toErrorMessage(error)}`,
        { workspaceId: owner.workspaceId, workflowId: owner.workflowId, runId: owner.runId }
      );
    }
  }

  private remember(known: KnownRun): void {
    this.knownRuns.set(known.owner.runId, known);
    const key = parentKey(known.owner.workspaceId, known.owner.parentSessionId);
    if (isActiveStatus(known.snapshot.status)) {
      this.activeByParent.set(key, known.owner.runId);
    } else if (this.activeByParent.get(key) === known.owner.runId) {
      this.activeByParent.delete(key);
    }
  }

  private async emitWake(owner: WorkflowRunOwner, snapshot: WorkflowRunSnapshot): Promise<void> {
    try {
      await this.wakeHandler({ workspaceId: owner.workspaceId, runId: snapshot.runId });
    } catch (error: unknown) {
      logger.warn(`[workflow] Failed to send Run wake: ${snapshot.runId}`, error);
    }
  }

  private shouldStartStage(current: WorkflowRunSnapshot, next: WorkflowRunSnapshot): boolean {
    if (next.status !== "running") return false;
    const shouldStart =
      current.status !== "running" ||
      current.currentStageId !== next.currentStageId ||
      current.visitCounts[next.currentStageId] !== next.visitCounts[next.currentStageId];

    if (shouldStart) {
      logger.info(
        `[workflow-engine] shouldStartStage=true: runId=${next.runId}, current.status=${current.status}, next.status=${next.status}, current.stageId=${current.currentStageId}, next.stageId=${next.currentStageId}, current.visitCounts[${next.currentStageId}]=${current.visitCounts[next.currentStageId] ?? 0}, next.visitCounts[${next.currentStageId}]=${next.visitCounts[next.currentStageId]}`
      );
    }

    return shouldStart;
  }

  private scheduleStageReady(owner: WorkflowRunOwner, snapshot: WorkflowRunSnapshot): void {
    if (!this.stageReadyHandler || this.shuttingDown || this.disposed) return;
    void Promise.resolve(this.stageReadyHandler(owner, snapshot)).catch((error: unknown) => {
      void this.advanceRun(owner, {
        type: "error",
        error: {
          code: "WORKFLOW_STAGE_START_FAILED",
          message: toErrorMessage(error),
          stageId: snapshot.currentStageId,
        },
      }).catch((advanceError: unknown) => {
        logger.error(
          `[workflow] Failed to project stage start error: ${snapshot.runId}`,
          advanceError
        );
      });
    });
  }

  private async cancelResources(owner: WorkflowRunOwner): Promise<void> {
    await this.cancelRunResourcesHandler?.(owner);
  }

  private interruptedSnapshot(
    snapshot: WorkflowRunSnapshot,
    code: string,
    message = "Workflow Run interrupted during application shutdown",
    errorDetails?: WorkflowRunError
  ): WorkflowRunSnapshot {
    const base = removePending(snapshot);
    return {
      ...base,
      status: "interrupted",
      error: {
        code,
        message,
        stageId: errorDetails?.stageId ?? snapshot.currentStageId,
        ...(errorDetails?.feature ? { feature: errorDetails.feature } : {}),
        ...(errorDetails?.refs ? { refs: errorDetails.refs } : {}),
      },
      updatedAt: this.dependencies.now(),
    };
  }

  private async toDetail(
    owner: WorkflowRunOwner,
    snapshot: WorkflowRunSnapshot
  ): Promise<WorkflowRunDetail> {
    const transcript = snapshot.agentSessionState?.sessionId
      ? await this.dependencies.readTranscript(owner, snapshot.agentSessionState.sessionId)
      : undefined;
    return {
      ...toSummary(snapshot),
      visitCounts: snapshot.visitCounts,
      artifacts: snapshot.artifacts,
      ...(snapshot.agentSessionState ? { agentSessionState: snapshot.agentSessionState } : {}),
      ...(snapshot.actionState ? { actionState: snapshot.actionState } : {}),
      ...(transcript === undefined ? {} : { transcript }),
    };
  }

  private enqueue<T>(
    queues: Map<string, Promise<void>>,
    key: string,
    task: AsyncTask<T>
  ): Promise<T> {
    const previous = queues.get(key) ?? Promise.resolve();
    const operation = previous.then(task);
    const tail = operation.then(
      () => undefined,
      () => undefined
    );
    queues.set(key, tail);
    return operation.finally(() => {
      if (queues.get(key) === tail) queues.delete(key);
    });
  }
}

export const workflowEngine = new WorkflowEngine();
