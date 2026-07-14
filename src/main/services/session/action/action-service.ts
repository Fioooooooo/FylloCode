import type {
  FylloActionState,
  RegisterFylloActionInput,
  TransitionFylloActionInput,
  TransitionFylloActionResult,
  TransitionFylloActionsInput,
} from "@shared/fyllo-action/protocol";
import {
  applyFylloActionTransition,
  createInitialFylloActionState,
  FylloActionStateMachineError,
} from "@shared/fyllo-action/state";
import { getFylloActionContract } from "@shared/fyllo-action/registry";
import { resolveProjectPath } from "@main/services/session/chat/chat-service";
import { loadSessionMeta, patchSessionMeta } from "@main/infra/storage/session-store";
import { ipcError } from "@main/ipc/_kit/errors";
import { IpcErrorCodes } from "@shared/constants/error-codes";

export class FylloActionServiceError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "FylloActionServiceError";
  }
}

function now(): string {
  return new Date().toISOString();
}

export async function registerAction(input: RegisterFylloActionInput): Promise<FylloActionState> {
  const projectPath = await resolveProjectPath(input.projectId);
  const currentMeta = await loadSessionMeta(projectPath, input.sessionId);
  if (!currentMeta) {
    throw ipcError(IpcErrorCodes.CHAT_SESSION_NOT_FOUND, `Session not found: ${input.sessionId}`);
  }

  const contract = getFylloActionContract(input.type);
  if (!contract || contract.interaction !== "confirm") {
    throw new FylloActionServiceError(
      "UNSUPPORTED_ACTION_TYPE",
      `Unsupported Fyllo action type: ${input.type}`
    );
  }

  const records = currentMeta.actionStates ?? {};
  const existing = records[input.actionId];

  if (existing) {
    if (existing.type !== input.type) {
      throw new FylloActionServiceError(
        "ACTION_TYPE_MISMATCH",
        `Action ${input.actionId} already exists with type ${existing.type}`
      );
    }
    return existing;
  }

  const nextMeta = await patchSessionMeta(projectPath, input.sessionId, {
    actionStates: {
      ...records,
      [input.actionId]: createInitialFylloActionState(input.type, { updatedAt: now() }),
    },
  });

  if (!nextMeta) {
    throw ipcError(IpcErrorCodes.CHAT_SESSION_NOT_FOUND, `Session not found: ${input.sessionId}`);
  }

  return nextMeta.actionStates![input.actionId];
}

interface ApplyTransitionOptions {
  command: TransitionFylloActionsInput["command"];
  error?: string;
}

function applyTransition(
  current: FylloActionState,
  expectedRevision: number,
  options: ApplyTransitionOptions
): TransitionFylloActionResult {
  if (current.revision !== expectedRevision) {
    return {
      actionId: "", // filled by caller
      success: false,
      error: "REVISION_MISMATCH",
    };
  }

  try {
    const record = applyFylloActionTransition(current, options.command, {
      updatedAt: now(),
      nextRevision: current.revision + 1,
      error: options.error,
    });
    return {
      actionId: "",
      success: true,
      record,
    };
  } catch (error) {
    return {
      actionId: "",
      success: false,
      error:
        error instanceof FylloActionStateMachineError ? "INVALID_TRANSITION" : "TRANSITION_FAILED",
    };
  }
}

export async function transitionAction(
  input: TransitionFylloActionInput
): Promise<FylloActionState> {
  const { records, projectPath } = await loadActionStates(input.projectId, input.sessionId);
  const current = records[input.actionId];

  if (!current) {
    throw new FylloActionServiceError("ACTION_NOT_FOUND", `Action not found: ${input.actionId}`);
  }

  const result = applyTransition(current, input.expectedRevision, {
    command: input.command,
    error: input.error,
  });

  if (!result.success) {
    throw new FylloActionServiceError(
      result.error ?? "TRANSITION_FAILED",
      `Failed to transition action ${input.actionId}`
    );
  }

  const nextMeta = await patchSessionMeta(projectPath, input.sessionId, {
    actionStates: {
      ...records,
      [input.actionId]: result.record!,
    },
  });

  if (!nextMeta) {
    throw ipcError(IpcErrorCodes.CHAT_SESSION_NOT_FOUND, `Session not found: ${input.sessionId}`);
  }

  return nextMeta.actionStates![input.actionId];
}

async function loadActionStates(projectId: string, sessionId: string) {
  const projectPath = await resolveProjectPath(projectId);
  const currentMeta = await loadSessionMeta(projectPath, sessionId);
  if (!currentMeta) {
    throw ipcError(IpcErrorCodes.CHAT_SESSION_NOT_FOUND, `Session not found: ${sessionId}`);
  }
  return { projectPath, records: { ...(currentMeta.actionStates ?? {}) } };
}

export async function transitionActions(
  input: TransitionFylloActionsInput
): Promise<TransitionFylloActionResult[]> {
  const { projectPath, records } = await loadActionStates(input.projectId, input.sessionId);
  const results: TransitionFylloActionResult[] = [];
  const nextRecords: Record<string, FylloActionState> = { ...records };

  for (const actionId of input.actionIds) {
    const current = records[actionId];
    const expectedRevision = input.expectedRevisions[actionId];

    if (!current) {
      results.push({
        actionId,
        success: false,
        error: "ACTION_NOT_FOUND",
      });
      continue;
    }

    const result = applyTransition(current, expectedRevision, {
      command: input.command,
      error: input.error,
    });
    result.actionId = actionId;
    results.push(result);

    if (result.success && result.record) {
      nextRecords[actionId] = result.record;
    }
  }

  if (!results.every((r) => r.success)) {
    return results;
  }

  const nextMeta = await patchSessionMeta(projectPath, input.sessionId, {
    actionStates: nextRecords,
  });

  if (!nextMeta) {
    throw ipcError(IpcErrorCodes.CHAT_SESSION_NOT_FOUND, `Session not found: ${input.sessionId}`);
  }

  return results.map((r) => ({
    ...r,
    record: nextMeta.actionStates![r.actionId],
  }));
}
