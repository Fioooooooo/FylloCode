import type { Message } from "@shared/types/chat";
import type { WorkflowRunSnapshot, WorkflowRunError } from "@shared/types/workflow";
import {
  AcpSession,
  createSessionMcpWorkspaceDescriptor,
  driveAcpTurn,
  getSessionExecutionContext,
  WorkflowAcpSessionStore,
  workflowSessionRegistryKey,
  type AcpSessionOpts,
} from "@main/services/session/_public";
import { newWorkflowSessionId } from "@main/infra/ids";
import type { WorkflowRunOwner } from "@main/infra/storage/workflow-run-store";
import type { WorkflowAdvanceEvent } from "@main/domain/automation/workflow/state-machine";
import type { WorkflowEngine, WorkflowEngineExecutionHooks } from "./workflow-engine";
import { interpolateTemplate } from "@main/domain/automation/workflow/template-interpolator";
import logger from "@main/infra/logger";

type AgentCompletion = Awaited<ReturnType<typeof driveAcpTurn>["completion"]>;

export interface WorkflowAgentRunnerEngine {
  updateRun(
    owner: WorkflowRunOwner,
    updater: (snapshot: WorkflowRunSnapshot) => WorkflowRunSnapshot | null
  ): Promise<WorkflowRunSnapshot | null>;
  advanceRun(owner: WorkflowRunOwner, event: WorkflowAdvanceEvent): Promise<unknown>;
  appendTranscript(
    owner: WorkflowRunOwner,
    sessionId: string,
    line: string | unknown
  ): Promise<void>;
}

export interface WorkflowAgentRunnerDependencies {
  getParentExecutionContext: typeof getSessionExecutionContext;
  createWorkspaceDescriptor: typeof createSessionMcpWorkspaceDescriptor;
  createSession: (options: AcpSessionOpts) => AcpSession;
  driveTurn: typeof driveAcpTurn;
  newSessionId: typeof newWorkflowSessionId;
  now: () => string;
}

const defaultDependencies: WorkflowAgentRunnerDependencies = {
  getParentExecutionContext: getSessionExecutionContext,
  createWorkspaceDescriptor: createSessionMcpWorkspaceDescriptor,
  createSession: (options) => new AcpSession(options),
  driveTurn: driveAcpTurn,
  newSessionId: newWorkflowSessionId,
  now: () => new Date().toISOString(),
};

interface ActiveAgentTurn {
  owner: WorkflowRunOwner;
  sessionId: string;
  runner: ReturnType<typeof driveAcpTurn>;
  cancelRequested: boolean;
}

function sameOwner(left: WorkflowRunOwner, right: WorkflowRunOwner): boolean {
  return (
    left.workspaceId === right.workspaceId &&
    left.workflowId === right.workflowId &&
    left.runId === right.runId &&
    left.parentSessionId === right.parentSessionId
  );
}

function messageText(message: Message | null): string {
  if (!message) return "";
  return message.parts.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function asError(
  error: unknown,
  stageId: string,
  code = "WORKFLOW_AGENT_START_FAILED"
): WorkflowRunError {
  return {
    code,
    message: errorMessage(error),
    stageId,
  };
}

export class WorkflowAgentRunner {
  private engine: WorkflowAgentRunnerEngine | null;
  private readonly dependencies: WorkflowAgentRunnerDependencies;
  private readonly active = new Map<string, ActiveAgentTurn>();

  constructor(
    engine: WorkflowAgentRunnerEngine | null = null,
    dependencies: Partial<WorkflowAgentRunnerDependencies> = {}
  ) {
    this.engine = engine;
    this.dependencies = { ...defaultDependencies, ...dependencies };
  }

  attachToEngine(engine: WorkflowEngine): void {
    this.engine = engine;
    const hooks: WorkflowEngineExecutionHooks = {
      onStageReady: (owner, snapshot) => this.startStage(owner, snapshot),
      cancelRunResources: (owner) => this.cancel(owner),
    };
    engine.configureExecutionHooks(hooks);
  }

  async startStage(owner: WorkflowRunOwner, snapshot: WorkflowRunSnapshot): Promise<void> {
    logger.info(
      `[workflow-agent-runner] startStage called: runId=${owner.runId}, status=${snapshot.status}, stageId=${snapshot.currentStageId}, visitCount=${snapshot.visitCounts[snapshot.currentStageId]}`
    );
    const engine = this.requireEngine();
    if (snapshot.status !== "running") {
      logger.warn(
        `[workflow-agent-runner] startStage aborted: status is ${snapshot.status}, expected running`
      );
      return;
    }

    const stage = snapshot.frozenDefinition.stages.find(
      (candidate) => candidate.id === snapshot.currentStageId
    );
    if (!stage || stage.kind !== "agent") {
      logger.warn(
        `[workflow-agent-runner] startStage aborted: stage not found or not agent. stageId=${snapshot.currentStageId}, found=${!!stage}, kind=${stage?.kind}`
      );
      return;
    }
    if (this.active.has(owner.runId)) {
      logger.warn(
        `[workflow-agent-runner] startStage aborted: already has active agent for runId=${owner.runId}`
      );
      return;
    }

    const sessionId = this.dependencies.newSessionId();
    const prepared = await engine.updateRun(owner, (current) => {
      if (current.status !== "running" || current.currentStageId !== stage.id) {
        logger.warn(
          `[workflow-agent-runner] updateRun aborted: status=${current.status}, currentStageId=${current.currentStageId}, expectedStageId=${stage.id}`
        );
        return null;
      }

      // 关键修复：如果 agentSessionState 存在，检查对应的 agent 是否已经完成
      // 判断依据：如果 stage.produces.id 对应的 artifact 已存在，说明 agent 已完成
      const artifactExists = stage.produces.id in current.artifacts;

      if (current.agentSessionState && !artifactExists) {
        // agentSessionState 存在且 agent 还未完成，说明正在运行中
        logger.warn(
          `[workflow-agent-runner] updateRun aborted: agentSessionState exists and agent is still running (no artifact yet)`
        );
        return null;
      }

      // 如果 artifact 已存在，说明这是回边重新执行，可以覆盖旧的 agentSessionState
      if (artifactExists) {
        logger.info(
          `[workflow-agent-runner] preparing new agent session (loop-back): sessionId=${sessionId}, stageId=${stage.id}, visitCount=${current.visitCounts[stage.id]}`
        );
      } else {
        logger.info(
          `[workflow-agent-runner] preparing new agent session (first time): sessionId=${sessionId}, stageId=${stage.id}, visitCount=${current.visitCounts[stage.id]}`
        );
      }

      return {
        ...current,
        agentSessionState: { sessionId },
        updatedAt: this.dependencies.now(),
      };
    });
    if (!prepared) {
      logger.warn(`[workflow-agent-runner] startStage aborted: updateRun returned null`);
      return;
    }

    try {
      const parent = await this.dependencies.getParentExecutionContext(
        owner.workspaceId,
        owner.parentSessionId
      );
      const descriptor = await this.dependencies.createWorkspaceDescriptor(
        parent.workspaceSnapshot,
        sessionId
      );
      const agentId = stage.agent ?? parent.agentId;
      const sessionOwner = {
        workspaceId: owner.workspaceId,
        workflowId: owner.workflowId,
        runId: owner.runId,
        parentSessionId: owner.parentSessionId,
        sessionId,
      };
      const sessionStore = new WorkflowAcpSessionStore(sessionOwner, {
        updateSnapshot: (runOwner, updater) => engine.updateRun(runOwner, updater),
      });
      const session = this.dependencies.createSession({
        fylloSessionId: sessionId,
        agentId,
        workspaceId: owner.workspaceId,
        projectPath: parent.workspaceSnapshot.cwd,
        cwd: parent.workspaceSnapshot.cwd,
        additionalDirectories: parent.workspaceSnapshot.additionalDirectories,
        workspaceSnapshot: parent.workspaceSnapshot,
        mcpWorkspaceDescriptor: descriptor,
        owner: "workflow",
        sessionStore,
        recoveryContext: {
          hasPersistedHistory: false,
          loadPersistedHistory: async () => [],
        },
        reminderContext: { runId: owner.runId },
      });
      // 插值模板变量
      const interpolatedPrompt = interpolateTemplate(stage.prompt, {
        run: {
          id: owner.runId,
          startedAt: snapshot.createdAt,
        },
        artifacts: snapshot.artifacts,
      });

      const runner = this.dependencies.driveTurn({
        session,
        owner: "workflow",
        registryKey: workflowSessionRegistryKey(
          owner.workspaceId,
          owner.workflowId,
          owner.runId,
          sessionId
        ),
        messageSessionId: sessionId,
        logTag: "workflow",
        runtimeScope: "app",
        start: () => session.start([{ type: "text", text: interpolatedPrompt }]),
        hooks: {},
      });
      const active: ActiveAgentTurn = {
        owner,
        sessionId,
        runner,
        cancelRequested: false,
      };
      this.active.set(owner.runId, active);

      await engine.appendTranscript(owner, sessionId, {
        kind: "message",
        role: "user",
        stageId: stage.id,
        sessionId,
        content: interpolatedPrompt,
        createdAt: this.dependencies.now(),
      });

      let startError: unknown;
      try {
        await runner.start();
      } catch (error: unknown) {
        startError = error;
        runner.cancel();
      }
      const completion = await runner.completion;
      await this.finishStage(active, stage.id, stage.produces.id, completion, startError);
    } catch (error: unknown) {
      await this.failStage(owner, stage.id, asError(error, stage.id));
    } finally {
      this.active.delete(owner.runId);
    }
  }

  async cancel(owner: WorkflowRunOwner): Promise<void> {
    const active = this.active.get(owner.runId);
    if (!active || !sameOwner(active.owner, owner)) return;
    active.cancelRequested = true;
    active.runner.cancel();
    await active.runner.completion.catch(() => undefined);
  }

  dispose(): void {
    for (const active of this.active.values()) {
      active.cancelRequested = true;
      active.runner.cancel();
    }
    this.active.clear();
  }

  private requireEngine(): WorkflowAgentRunnerEngine {
    if (!this.engine) throw new Error("Workflow Agent runner is not attached to WorkflowEngine");
    return this.engine;
  }

  private async finishStage(
    active: ActiveAgentTurn,
    stageId: string,
    artifactId: string,
    completion: AgentCompletion,
    startError: unknown
  ): Promise<void> {
    const engine = this.requireEngine();
    if (startError) {
      if (active.cancelRequested) return;
      await this.failStage(active.owner, stageId, asError(startError, stageId));
      return;
    }

    if (completion.status === "cancelled") {
      if (active.cancelRequested) return;
      await this.failStage(
        active.owner,
        stageId,
        asError(new Error("Workflow Agent turn was cancelled"), stageId, "WORKFLOW_AGENT_CANCELLED")
      );
      return;
    }

    if (completion.status === "error") {
      const partialText = messageText(completion.partialMessage);
      await engine.appendTranscript(active.owner, active.sessionId, {
        kind: "error",
        stageId,
        sessionId: active.sessionId,
        code: completion.code,
        message: completion.message,
        ...(partialText ? { partialText } : {}),
        createdAt: this.dependencies.now(),
      });
      await this.failStage(
        active.owner,
        stageId,
        asError(
          new Error(`${completion.code}: ${completion.message}`),
          stageId,
          "WORKFLOW_AGENT_TURN_FAILED"
        )
      );
      return;
    }

    const text = messageText(completion.message);
    await engine.appendTranscript(active.owner, active.sessionId, {
      kind: "message",
      role: "assistant",
      stageId,
      sessionId: active.sessionId,
      text,
      message: completion.message,
      totalTokens: completion.totalTokens,
      createdAt: this.dependencies.now(),
    });
    await engine.advanceRun(active.owner, {
      type: "agent-completed",
      artifact: { id: artifactId, schema: "freeform", value: text },
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
      logger.warn(`[workflow] failed to project Agent stage error: ${owner.runId}`, advanceError);
    }
  }
}

export const workflowAgentRunner = new WorkflowAgentRunner();
