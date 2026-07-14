import type { FylloActionCommand, FylloActionState, FylloActionStateStatus } from "./protocol";

export function isFylloActionResolved(state: FylloActionState): boolean {
  return state.status === "succeeded" || state.status === "cancelled";
}

export function requiresFylloActionAttention(state: FylloActionState): boolean {
  return state.status === "ready" || state.status === "failed";
}

export function isFylloActionTerminal(status: FylloActionStateStatus): boolean {
  return status === "succeeded" || status === "cancelled";
}

const validTransitions: Record<
  FylloActionStateStatus | "__none__",
  readonly FylloActionStateStatus[]
> = {
  __none__: ["ready"],
  ready: ["succeeded", "failed", "cancelled"],
  failed: ["succeeded", "failed", "cancelled"],
  succeeded: [],
  cancelled: [],
};

export function isValidFylloActionTransition(
  from: FylloActionStateStatus | undefined,
  to: FylloActionStateStatus
): boolean {
  const key = from ?? "__none__";
  return validTransitions[key].includes(to);
}

export function commandToStatus(command: FylloActionCommand): FylloActionStateStatus {
  switch (command) {
    case "succeed":
      return "succeeded";
    case "fail":
      return "failed";
    case "cancel":
      return "cancelled";
  }
}

export function applyFylloActionTransition(
  current: FylloActionState | undefined,
  command: FylloActionCommand,
  options: { updatedAt: string; nextRevision: number; error?: string }
): FylloActionState {
  const targetStatus = commandToStatus(command);
  const fromStatus = current?.status;

  if (!isValidFylloActionTransition(fromStatus, targetStatus)) {
    throw new FylloActionStateMachineError(
      `Invalid transition from ${fromStatus ?? "none"} to ${targetStatus}`
    );
  }

  const type = current?.type;
  if (!type) {
    throw new FylloActionStateMachineError(
      "Cannot transition an action that has not been registered"
    );
  }

  return {
    type,
    status: targetStatus,
    revision: options.nextRevision,
    updatedAt: options.updatedAt,
    error: command === "fail" ? options.error : undefined,
  };
}

export function createInitialFylloActionState(
  type: FylloActionState["type"],
  options: { updatedAt: string }
): FylloActionState {
  return {
    type,
    status: "ready",
    revision: 1,
    updatedAt: options.updatedAt,
  };
}

export class FylloActionStateMachineError extends Error {
  readonly code = "FYLLO_ACTION_STATE_MACHINE_ERROR";
  constructor(message: string) {
    super(message);
    this.name = "FylloActionStateMachineError";
  }
}
