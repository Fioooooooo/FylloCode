import type {
  FylloActionCommand,
  FylloActionHandlerResult,
  FylloActionPayload,
  FylloActionState,
  FylloActionType,
  TransitionFylloActionResult,
} from "@shared/fyllo-action/protocol";
import type { FylloActionDispatchHandler } from "./types";
import type { FylloActionExecutionRuntime } from "./execution-runtime";

export interface TransitionActionPort {
  (input: {
    projectId: string;
    sessionId: string;
    actionId: string;
    command: FylloActionCommand;
    expectedRevision: number;
    error?: string;
  }): Promise<FylloActionState>;
}

export interface TransitionActionsPort {
  (input: {
    projectId: string;
    sessionId: string;
    actionIds: string[];
    command: FylloActionCommand;
    expectedRevisions: Record<string, number>;
  }): Promise<TransitionFylloActionResult[]>;
}

export interface PersistActionStatePort {
  (actionId: string, state: FylloActionState): Promise<void>;
}

export interface GetActionStatePort {
  (actionId: string): FylloActionState | undefined;
}

export interface FylloActionExecutionControllerInput<Type extends FylloActionType> {
  projectId: string;
  sessionId: string;
  actionId: string;
  type: Type;
  handler: FylloActionDispatchHandler<Type>;
  runtime: FylloActionExecutionRuntime;
  transitionAction: TransitionActionPort;
  transitionActions: TransitionActionsPort;
  persistActionState: PersistActionStatePort;
  getActionState: GetActionStatePort;
}

export interface FylloActionExecutionController {
  execute(payload: FylloActionPayload): Promise<void>;
  cancel(): Promise<void>;
  retrySync(): Promise<void>;
}

interface PendingSync {
  command: FylloActionCommand;
  extraActionIds: string[];
  error?: string;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function resolveExpectedRevision(getActionState: GetActionStatePort, actionId: string): number {
  return getActionState(actionId)?.revision ?? 1;
}

export function createFylloActionExecutionController<Type extends FylloActionType>(
  input: FylloActionExecutionControllerInput<Type>
): FylloActionExecutionController {
  // Freeze the execution context at creation time so project/session switches during a
  // long-running handler or retry do not write state to the wrong context.
  const {
    projectId,
    sessionId,
    actionId,
    handler,
    runtime,
    transitionAction,
    transitionActions,
    persistActionState,
    getActionState,
  } = input;

  let pendingSync: PendingSync | null = null;

  async function syncTerminalState(
    command: FylloActionCommand,
    extraActionIds: string[] = [],
    error?: string
  ): Promise<void> {
    pendingSync = { command, extraActionIds, error };
    runtime.clearStateSyncError();

    const allActionIds = Array.from(new Set([actionId, ...extraActionIds]));

    try {
      if (allActionIds.length === 1) {
        const state = await transitionAction({
          projectId,
          sessionId,
          actionId,
          command,
          expectedRevision: resolveExpectedRevision(getActionState, actionId),
          error,
        });
        await persistActionState(actionId, state);
      } else {
        const expectedRevisions = Object.fromEntries(
          allActionIds.map((id) => [id, resolveExpectedRevision(getActionState, id)])
        );

        const results = await transitionActions({
          projectId,
          sessionId,
          actionIds: allActionIds,
          command,
          expectedRevisions,
        });

        const failures = results.filter((r) => !r.success);
        if (failures.length > 0) {
          throw new Error(failures.map((f) => `${f.actionId}: ${f.error ?? "unknown"}`).join("; "));
        }

        // Only persist locally after the entire batch succeeded on Main; this keeps the
        // renderer store consistent with the authoritative session meta.
        await Promise.all(
          results
            .filter((r): r is TransitionFylloActionResult & { record: FylloActionState } =>
              Boolean(r.record)
            )
            .map((r) => persistActionState(r.actionId, r.record))
        );
      }

      pendingSync = null;
    } catch (error) {
      const message = getErrorMessage(error);
      runtime.setStateSyncError(message);
      throw error;
    }
  }

  async function execute(payload: FylloActionPayload): Promise<void> {
    runtime.setRunning();

    let result: FylloActionHandlerResult;
    try {
      result = await handler(payload as never, {
        context: { projectId, sessionId, actionId },
      });
    } catch (error) {
      const message = getErrorMessage(error);
      runtime.setFailed(message);
      await syncTerminalState("fail", [], message).catch(() => undefined);
      return;
    }

    if (result.outcome === "succeeded") {
      runtime.setSucceeded();
      await syncTerminalState("succeed", result.completedActionIds).catch(() => undefined);
      return;
    }

    if (result.outcome === "cancelled") {
      runtime.setCancelled();
      await syncTerminalState("cancel").catch(() => undefined);
      return;
    }

    if (result.outcome === "dismissed") {
      runtime.reset();
      return;
    }

    runtime.setFailed(result.error ?? "执行失败");
    await syncTerminalState("fail", [], result.error).catch(() => undefined);
  }

  async function cancel(): Promise<void> {
    runtime.setCancelled();
    await syncTerminalState("cancel").catch(() => undefined);
  }

  async function retrySync(): Promise<void> {
    if (!pendingSync) {
      return;
    }

    await syncTerminalState(
      pendingSync.command,
      pendingSync.extraActionIds,
      pendingSync.error
    ).catch(() => undefined);
  }

  return {
    execute,
    cancel,
    retrySync,
  };
}
