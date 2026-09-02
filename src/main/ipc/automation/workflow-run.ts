import { ipcMain } from "electron";
import {
  decideWorkflowRunInputSchema,
  getWorkflowRunDetailInputSchema,
  listWorkflowRunsInputSchema,
} from "@shared/ipc/automation/workflow-run.schemas";
import { AutomationWorkflowRunChannels } from "@shared/ipc/automation/workflow-run.channels";
import type {
  WorkflowRunDecisionRequest,
  WorkflowRunDetailRequest,
  WorkflowRunListRequest,
  WorkflowRunWakePayload,
} from "@shared/types/workflow";
import {
  workflowEngine,
  type WorkflowEngine,
} from "@main/services/automation/workflow/workflow-engine";
import type { WorkspaceWindowManager } from "@main/bootstrap/workspace-window-manager";
import { getRequiredWorkspaceInfo } from "@main/services/workspace/_public";
import { assertSessionBelongsToWorkspace } from "@main/services/session/chat/chat-service";
import { validate } from "../_kit/schema";
import { wrapHandler } from "../_kit/wrap-handler";
import { requireWorkspaceSender } from "../_kit/workspace-scope";

export interface WorkflowRunHandlerEngine {
  listRuns(request: WorkflowRunListRequest): ReturnType<WorkflowEngine["listRuns"]>;
  getRunDetail(request: WorkflowRunDetailRequest): ReturnType<WorkflowEngine["getRunDetail"]>;
  decideRun(request: WorkflowRunDecisionRequest): ReturnType<WorkflowEngine["decideRun"]>;
}

export interface WorkflowRunWakeDispatcherOptions {
  delayMs?: number;
  setTimeout?: typeof setTimeout;
  clearTimeout?: typeof clearTimeout;
}

export class WorkflowRunWakeDispatcher {
  private readonly delayMs: number;
  private readonly setTimer: typeof setTimeout;
  private readonly clearTimer: typeof clearTimeout;
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private closed = false;

  constructor(
    private readonly manager: Pick<WorkspaceWindowManager, "sendToWorkspace">,
    options: WorkflowRunWakeDispatcherOptions = {}
  ) {
    this.delayMs = options.delayMs ?? 40;
    this.setTimer = options.setTimeout ?? setTimeout;
    this.clearTimer = options.clearTimeout ?? clearTimeout;
  }

  notify(payload: WorkflowRunWakePayload): void {
    if (this.closed) return;
    const key = `${payload.workspaceId}\0${payload.runId}`;
    if (this.timers.has(key)) return;
    const timer = this.setTimer(() => {
      this.timers.delete(key);
      if (this.closed) return;
      this.manager.sendToWorkspace(
        payload.workspaceId,
        AutomationWorkflowRunChannels.wake,
        payload
      );
    }, this.delayMs);
    timer.unref?.();
    this.timers.set(key, timer);
  }

  dispose(): void {
    if (this.closed) return;
    this.closed = true;
    for (const timer of this.timers.values()) this.clearTimer(timer);
    this.timers.clear();
  }
}

export function setupWorkflowRunBroadcast(
  manager: Pick<WorkspaceWindowManager, "sendToWorkspace">,
  engine: Pick<WorkflowEngine, "setWakeHandler"> = workflowEngine,
  options: WorkflowRunWakeDispatcherOptions = {}
): () => void {
  const dispatcher = new WorkflowRunWakeDispatcher(manager, options);
  engine.setWakeHandler((payload) => dispatcher.notify(payload));
  return () => {
    dispatcher.dispose();
    engine.setWakeHandler(null);
  };
}

async function assertWorkflowRunOwner(workspaceId: string, parentSessionId: string): Promise<void> {
  await getRequiredWorkspaceInfo(workspaceId);
  await assertSessionBelongsToWorkspace(workspaceId, parentSessionId);
}

export function registerWorkflowRunHandlers(
  engine: WorkflowRunHandlerEngine = workflowEngine
): void {
  ipcMain.handle(AutomationWorkflowRunChannels.list, (event, input: unknown) =>
    wrapHandler(async () => {
      const request = validate(listWorkflowRunsInputSchema, input);
      requireWorkspaceSender(event.sender, request.workspaceId);
      await assertWorkflowRunOwner(request.workspaceId, request.parentSessionId);
      return engine.listRuns(request);
    })
  );

  ipcMain.handle(AutomationWorkflowRunChannels.getDetail, (event, input: unknown) =>
    wrapHandler(async () => {
      const request = validate(getWorkflowRunDetailInputSchema, input);
      requireWorkspaceSender(event.sender, request.workspaceId);
      await assertWorkflowRunOwner(request.workspaceId, request.parentSessionId);
      return engine.getRunDetail(request);
    })
  );

  ipcMain.handle(AutomationWorkflowRunChannels.decide, (event, input: unknown) =>
    wrapHandler(async () => {
      const request = validate(decideWorkflowRunInputSchema, input);
      requireWorkspaceSender(event.sender, request.workspaceId);
      await assertWorkflowRunOwner(request.workspaceId, request.parentSessionId);
      return engine.decideRun(request);
    })
  );
}
