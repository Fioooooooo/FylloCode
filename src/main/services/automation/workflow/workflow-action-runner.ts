import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { isAbsolute, relative, resolve, sep } from "node:path";
import spawn from "cross-spawn";
import type { WorkflowRunError, WorkflowRunSnapshot } from "@shared/types/workflow";
import {
  getSessionExecutionContext,
  type SessionExecutionContext,
} from "@main/services/session/_public";
import {
  appendWorkflowActionLog,
  type WorkflowRunOwner,
} from "@main/infra/storage/workflow-run-store";
import { trackAuxiliaryProcess } from "@main/infra/process/auxiliary-process-registry";
import type { WorkflowAdvanceEvent } from "@main/domain/automation/workflow/state-machine";
import { interpolateTemplate } from "@main/domain/automation/workflow/template-interpolator";
import logger from "@main/infra/logger";
import type { WorkflowEngine, WorkflowEngineExecutionHooks } from "./workflow-engine";

const ACTION_LOG_PREFIX = "action-outputs";

export interface WorkflowActionRunnerEngine {
  updateRun(
    owner: WorkflowRunOwner,
    updater: (snapshot: WorkflowRunSnapshot) => WorkflowRunSnapshot | null
  ): Promise<WorkflowRunSnapshot | null>;
  advanceRun(owner: WorkflowRunOwner, event: WorkflowAdvanceEvent): Promise<unknown>;
}

export interface WorkflowActionRunnerDependencies {
  getParentExecutionContext: typeof getSessionExecutionContext;
  appendActionLog: typeof appendWorkflowActionLog;
  spawnCommand: (command: string, cwd: string) => ChildProcessWithoutNullStreams;
  trackProcess: typeof trackAuxiliaryProcess;
  now: () => string;
}

const defaultDependencies: WorkflowActionRunnerDependencies = {
  getParentExecutionContext: getSessionExecutionContext,
  appendActionLog: appendWorkflowActionLog,
  spawnCommand: (command, cwd) =>
    spawn(command, [], {
      cwd,
      shell: true,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    }) as ChildProcessWithoutNullStreams,
  trackProcess: trackAuxiliaryProcess,
  now: () => new Date().toISOString(),
};

export class WorkflowActionRunnerError extends Error {
  constructor(
    readonly code: "WORKFLOW_ACTION_CWD_FORBIDDEN" | "WORKFLOW_ACTION_START_FAILED",
    message: string,
    readonly details: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = "WorkflowActionRunnerError";
  }
}

interface ProcessResult {
  exitCode: number | null;
  signal: string | null;
  error?: unknown;
}

interface ActiveAction {
  owner: WorkflowRunOwner;
  stageId: string;
  child: ChildProcessWithoutNullStreams;
  cancelRequested: boolean;
  finished: Promise<ProcessResult>;
}

function sameOwner(left: WorkflowRunOwner, right: WorkflowRunOwner): boolean {
  return (
    left.workspaceId === right.workspaceId &&
    left.workflowId === right.workflowId &&
    left.runId === right.runId &&
    left.parentSessionId === right.parentSessionId
  );
}

function isWithin(root: string, target: string): boolean {
  const pathFromRoot = relative(root, target);
  return (
    pathFromRoot === "" ||
    (pathFromRoot !== ".." && !pathFromRoot.startsWith(`..${sep}`) && !isAbsolute(pathFromRoot))
  );
}

export function resolveWorkflowActionCwd(
  snapshot: SessionExecutionContext["workspaceSnapshot"],
  requestedCwd?: string
): string {
  const candidate =
    requestedCwd === undefined
      ? snapshot.cwd
      : isAbsolute(requestedCwd)
        ? resolve(requestedCwd)
        : resolve(snapshot.cwd, requestedCwd);
  const authorizedRoots = snapshot.folders.map((folder) => resolve(folder.folderPath));
  if (!authorizedRoots.some((root) => isWithin(root, candidate))) {
    throw new WorkflowActionRunnerError(
      "WORKFLOW_ACTION_CWD_FORBIDDEN",
      `Action cwd is outside the parent Session Workspace snapshot: ${requestedCwd ?? snapshot.cwd}`,
      {
        requestedCwd: requestedCwd ?? null,
        resolvedCwd: candidate,
        authorizedRoots,
      }
    );
  }
  return candidate;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function asStageError(
  error: unknown,
  stageId: string,
  code = "WORKFLOW_ACTION_START_FAILED"
): WorkflowRunError {
  return {
    code: error instanceof WorkflowActionRunnerError ? error.code : code,
    message: errorMessage(error),
    stageId,
  };
}

export class WorkflowActionRunner {
  private readonly dependencies: WorkflowActionRunnerDependencies;
  private readonly active = new Map<string, ActiveAction>();
  private engine: WorkflowActionRunnerEngine | null;

  constructor(
    engine: WorkflowActionRunnerEngine | null = null,
    dependencies: Partial<WorkflowActionRunnerDependencies> = {}
  ) {
    this.engine = engine;
    this.dependencies = { ...defaultDependencies, ...dependencies };
  }

  attachEngine(engine: WorkflowEngine): void {
    this.engine = engine;
    const hooks: WorkflowEngineExecutionHooks = {
      onStageReady: (owner, snapshot) => this.startStage(owner, snapshot),
      cancelRunResources: (owner) => this.cancel(owner),
    };
    engine.configureExecutionHooks(hooks);
  }

  async startStage(owner: WorkflowRunOwner, snapshot: WorkflowRunSnapshot): Promise<void> {
    logger.info(
      `[workflow-action-runner] startStage called: runId=${owner.runId}, status=${snapshot.status}, stageId=${snapshot.currentStageId}, visitCount=${snapshot.visitCounts[snapshot.currentStageId]}`
    );
    const engine = this.requireEngine();
    if (snapshot.status !== "running") {
      logger.warn(
        `[workflow-action-runner] startStage aborted: status is ${snapshot.status}, expected running`
      );
      return;
    }
    const stage = snapshot.frozenDefinition.stages.find(
      (candidate) => candidate.id === snapshot.currentStageId
    );
    if (!stage || stage.kind !== "action") {
      logger.warn(
        `[workflow-action-runner] startStage aborted: stage not found or not action. stageId=${snapshot.currentStageId}, found=${!!stage}, kind=${stage?.kind}`
      );
      return;
    }
    if (stage.op.type !== "exec") {
      logger.error(`[workflow-action-runner] Unsupported action op type: ${stage.op.type}`);
      await this.failStage(
        owner,
        stage.id,
        asStageError(new Error(`Unsupported Action operation: ${stage.op.type}`), stage.id)
      );
      return;
    }
    if (this.active.has(owner.runId)) {
      logger.warn(
        `[workflow-action-runner] startStage aborted: already has active action for runId=${owner.runId}`
      );
      return;
    }

    try {
      const parent = await this.dependencies.getParentExecutionContext(
        owner.workspaceId,
        owner.parentSessionId
      );

      // 插值模板变量
      const interpolatedCommand = interpolateTemplate(stage.op.command, {
        run: {
          id: owner.runId,
          startedAt: snapshot.createdAt,
        },
        artifacts: snapshot.artifacts,
      });

      logger.info(
        `[workflow-action-runner] Executing command: runId=${owner.runId}, stageId=${stage.id}, command="${interpolatedCommand}", cwd will be resolved`
      );

      const cwd = resolveWorkflowActionCwd(parent.workspaceSnapshot, stage.op.cwd);
      logger.info(
        `[workflow-action-runner] Command cwd resolved: runId=${owner.runId}, stageId=${stage.id}, cwd="${cwd}"`
      );
      const logPath = `${ACTION_LOG_PREFIX}/${stage.id}.log`;
      const prepared = await engine.updateRun(owner, (current) => {
        if (
          current.status !== "running" ||
          current.currentStageId !== stage.id ||
          current.actionState
        ) {
          return null;
        }
        return {
          ...current,
          actionState: {
            stageId: stage.id,
            logPath,
            startedAt: this.dependencies.now(),
          },
          updatedAt: this.dependencies.now(),
        };
      });
      if (!prepared) return;

      const child = this.dependencies.spawnCommand(interpolatedCommand, cwd);
      this.dependencies.trackProcess(child);
      const active: ActiveAction = {
        owner,
        stageId: stage.id,
        child,
        cancelRequested: false,
        finished: this.waitForProcess(owner, stage.id, child),
      };
      this.active.set(owner.runId, active);
      const result = await active.finished;
      // 先删除 active entry，再调用 finishStage
      // 避免 finishStage -> advanceRun -> scheduleStageReady 时产生竞态
      this.active.delete(owner.runId);
      await this.finishStage(active, result);
    } catch (error: unknown) {
      await this.failStage(owner, stage.id, asStageError(error, stage.id));
    } finally {
      // 确保无论如何都会清理
      this.active.delete(owner.runId);
    }
  }

  async cancel(owner: WorkflowRunOwner): Promise<void> {
    const active = this.active.get(owner.runId);
    if (!active || !sameOwner(active.owner, owner)) return;
    active.cancelRequested = true;
    try {
      if (active.child.exitCode === null && active.child.signalCode === null) {
        active.child.kill("SIGTERM");
      }
    } catch (error: unknown) {
      logger.warn(`[workflow] failed to cancel Action process: ${owner.runId}`, error);
    }
    await active.finished.catch(() => undefined);
  }

  async dispose(): Promise<void> {
    await Promise.all([...this.active.values()].map((active) => this.cancel(active.owner)));
  }

  private requireEngine(): WorkflowActionRunnerEngine {
    if (!this.engine) throw new Error("Workflow Action runner is not attached to WorkflowEngine");
    return this.engine;
  }

  private waitForProcess(
    owner: WorkflowRunOwner,
    stageId: string,
    child: ChildProcessWithoutNullStreams
  ): Promise<ProcessResult> {
    const writes: Promise<void>[] = [];
    const appendOutput = (chunk: Buffer | string): void => {
      const write = this.dependencies.appendActionLog(owner, stageId, chunk);
      writes.push(write);
      void write.catch((error: unknown) => {
        logger.warn(`[workflow] failed to append Action output: ${owner.runId}/${stageId}`, error);
      });
    };
    child.stdout.on("data", appendOutput);
    child.stderr.on("data", appendOutput);

    return new Promise<ProcessResult>((resolveResult) => {
      let processError: unknown;
      let settled = false;
      const settle = (result: Omit<ProcessResult, "error">): void => {
        if (settled) return;
        settled = true;
        void Promise.all(writes).then(
          () => resolveResult({ ...result, ...(processError ? { error: processError } : {}) }),
          (error: unknown) => resolveResult({ ...result, error })
        );
      };
      child.once("error", (error: unknown) => {
        processError = error;
      });
      child.once("close", (exitCode: number | null, signal: string | null) => {
        settle({ exitCode, signal });
      });
    });
  }

  private async finishStage(active: ActiveAction, result: ProcessResult): Promise<void> {
    const engine = this.requireEngine();
    const endedAt = this.dependencies.now();
    const updated = await engine.updateRun(active.owner, (current) => {
      if (current.actionState?.stageId !== active.stageId) return null;
      return {
        ...current,
        actionState: {
          ...current.actionState,
          endedAt,
          ...(result.exitCode === null ? {} : { exitCode: result.exitCode }),
          ...(result.signal === null ? {} : { signal: result.signal }),
        },
        updatedAt: endedAt,
      };
    });
    if (!updated || active.cancelRequested) return;

    if (result.error) {
      logger.error(
        `[workflow-action-runner] Action failed with error: runId=${active.owner.runId}, stageId=${active.stageId}, error=${errorMessage(result.error)}`
      );
      await this.failStage(
        active.owner,
        active.stageId,
        asStageError(result.error, active.stageId)
      );
      return;
    }
    logger.info(
      `[workflow-action-runner] Action completed: runId=${active.owner.runId}, stageId=${active.stageId}, exitCode=${result.exitCode}, signal=${result.signal}`
    );

    // 区分环境错误（error）和业务失败（fail）
    // exitCode=127: 命令不存在
    // signal !== null: 进程被信号终止
    // 这些情况应该终止 workflow，而不是按 fail transition 回边
    if (result.exitCode === 127 || result.signal !== null) {
      logger.error(
        `[workflow-action-runner] Action execution error: runId=${active.owner.runId}, stageId=${active.stageId}, exitCode=${result.exitCode}, signal=${result.signal}`
      );
      await engine.advanceRun(active.owner, {
        type: "error",
        error: {
          code: "ACTION_EXECUTION_ERROR",
          message:
            result.exitCode === 127
              ? `Command not found in action stage '${active.stageId}'`
              : `Action process terminated by signal: ${result.signal}`,
          stageId: active.stageId,
        },
      });
      return;
    }

    // exitCode=0 或 1-126: 正常完成（pass）或业务失败（fail）
    await engine.advanceRun(active.owner, {
      type: "action-completed",
      ...(result.exitCode === null ? {} : { exitCode: result.exitCode }),
      ...(result.signal === null ? {} : { signal: result.signal }),
    });
  }

  private async failStage(
    owner: WorkflowRunOwner,
    stageId: string,
    error: WorkflowRunError
  ): Promise<void> {
    try {
      await this.requireEngine().advanceRun(owner, {
        type: "stage-failed",
        error: error.stageId ? error : { ...error, stageId },
      });
    } catch (advanceError: unknown) {
      logger.warn(`[workflow] failed to project Action stage error: ${owner.runId}`, advanceError);
    }
  }
}

export const workflowActionRunner = new WorkflowActionRunner();
