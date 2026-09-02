import type {
  WorkflowArtifact,
  WorkflowRunError,
  WorkflowRunSnapshot,
  WorkflowStep,
} from "@shared/types/workflow";

export type WorkflowAdvanceEvent =
  | { type: "start-approved"; at?: string }
  | { type: "start-rejected"; at?: string; reason?: string }
  | { type: "action-approved"; at?: string }
  | { type: "action-rejected"; at?: string; reason?: string }
  | { type: "gate-decision"; decision: "approve" | "reject"; at?: string }
  | { type: "agent-completed"; artifact: WorkflowArtifact; at?: string }
  | { type: "action-completed"; exitCode?: number; signal?: string; at?: string }
  | { type: "stage-failed"; error: WorkflowRunError; at?: string }
  | { type: "signal-received"; outcome: "pass" | "fail"; at?: string }
  | { type: "cancel"; reason?: string; at?: string }
  | { type: "error"; error: WorkflowRunError; at?: string };

export type WorkflowStateMachineErrorCode =
  | "WORKFLOW_INVALID_EVENT"
  | "WORKFLOW_STAGE_MISMATCH"
  | "WORKFLOW_TRANSITION_MISSING"
  | "WORKFLOW_MAX_LOOPS_EXCEEDED"
  | "WORKFLOW_TERMINAL_RUN";

export class WorkflowStateMachineError extends Error {
  readonly code: WorkflowStateMachineErrorCode;
  readonly stageId?: string;
  readonly details: { stageId?: string; eventType: WorkflowAdvanceEvent["type"] };

  constructor(
    code: WorkflowStateMachineErrorCode,
    message: string,
    event: WorkflowAdvanceEvent,
    stageId?: string
  ) {
    super(message);
    this.name = "WorkflowStateMachineError";
    this.code = code;
    this.stageId = stageId;
    this.details = { stageId, eventType: event.type };
  }
}

function at(snapshot: WorkflowRunSnapshot, event: WorkflowAdvanceEvent): string {
  return event.at ?? snapshot.updatedAt;
}

function stepFor(snapshot: WorkflowRunSnapshot): WorkflowStep {
  const step = snapshot.frozenDefinition.stages.find(
    (candidate) => candidate.id === snapshot.currentStageId
  );
  if (!step) {
    throw new Error(`Workflow stage is missing from frozen definition: ${snapshot.currentStageId}`);
  }
  return step;
}

function withoutPending(
  snapshot: WorkflowRunSnapshot
): Omit<WorkflowRunSnapshot, "pendingDecision"> {
  const { pendingDecision, ...rest } = snapshot;
  void pendingDecision;
  return rest;
}

function withoutError(snapshot: WorkflowRunSnapshot): Omit<WorkflowRunSnapshot, "error"> {
  const { error, ...rest } = snapshot;
  void error;
  return rest;
}

function terminalSnapshot(
  snapshot: WorkflowRunSnapshot,
  status: "succeeded" | "failed" | "cancelled" | "interrupted",
  timestamp: string,
  error?: WorkflowRunError
): WorkflowRunSnapshot {
  const base = withoutPending(snapshot);
  const next = {
    ...base,
    status,
    updatedAt: timestamp,
    ...(error ? { error } : {}),
  };
  if (!error) {
    const { error: previousError, ...withoutPreviousError } = next;
    void previousError;
    return withoutPreviousError;
  }
  return next;
}

function findTransition(snapshot: WorkflowRunSnapshot, outcome: "pass" | "fail" | "signal") {
  return stepFor(snapshot).next?.find((transition) => transition.on === outcome);
}

function prepareCurrentStage(
  snapshot: WorkflowRunSnapshot,
  timestamp: string
): WorkflowRunSnapshot {
  const step = stepFor(snapshot);
  if (step.kind !== "action" || step.confirm === false) {
    return { ...snapshot, status: "running", updatedAt: timestamp };
  }
  return {
    ...snapshot,
    status: "awaiting_action_confirmation",
    pendingDecision: {
      kind: "action",
      prompt: `确认执行 Action：${step.name ?? step.id}`,
      stageId: step.id,
    },
    updatedAt: timestamp,
  };
}

function failForMissingTransition(
  snapshot: WorkflowRunSnapshot,
  event: WorkflowAdvanceEvent,
  outcome: "pass" | "fail" | "signal"
): WorkflowRunSnapshot {
  const stageId = snapshot.currentStageId;
  const error: WorkflowRunError = {
    code: "WORKFLOW_TRANSITION_MISSING",
    message: `Stage ${stageId} has no ${outcome} transition`,
    stageId,
  };
  return terminalSnapshot(snapshot, "failed", at(snapshot, event), error);
}

function moveTo(
  snapshot: WorkflowRunSnapshot,
  event: WorkflowAdvanceEvent,
  outcome: "pass" | "fail" | "signal"
): WorkflowRunSnapshot {
  const transition = findTransition(snapshot, outcome);
  if (!transition) {
    if (stepFor(snapshot).terminal === true && outcome === "pass") {
      return terminalSnapshot(snapshot, "succeeded", at(snapshot, event));
    }
    return failForMissingTransition(snapshot, event, outcome);
  }

  const previousCount = snapshot.visitCounts[transition.goto] ?? 0;
  const nextCount = previousCount + 1;
  if (previousCount > 0 && transition.maxLoops !== undefined && nextCount > transition.maxLoops) {
    return terminalSnapshot(snapshot, "failed", at(snapshot, event), {
      code: "WORKFLOW_MAX_LOOPS_EXCEEDED",
      message: `Stage ${transition.goto} exceeded maxLoops=${transition.maxLoops}`,
      stageId: snapshot.currentStageId,
      feature: "maxLoops",
      refs: [transition.goto],
    });
  }

  const base: WorkflowRunSnapshot = {
    ...withoutPending(withoutError(snapshot)),
    status: "running",
    currentStageId: transition.goto,
    visitCounts: { ...snapshot.visitCounts, [transition.goto]: nextCount },
    updatedAt: at(snapshot, event),
    // 清理前一个 action 的 state，避免阻塞下一个 action stage
    actionState: undefined,
  };
  return prepareCurrentStage(base, at(snapshot, event));
}

function invalidEvent(
  snapshot: WorkflowRunSnapshot,
  event: WorkflowAdvanceEvent,
  message: string,
  code: WorkflowStateMachineErrorCode = "WORKFLOW_INVALID_EVENT"
): never {
  throw new WorkflowStateMachineError(code, message, event, snapshot.currentStageId);
}

function requireRunning(snapshot: WorkflowRunSnapshot, event: WorkflowAdvanceEvent): void {
  if (snapshot.status !== "running") {
    invalidEvent(snapshot, event, `Run is not running: ${snapshot.status}`);
  }
}

export function advance(
  snapshot: WorkflowRunSnapshot,
  event: WorkflowAdvanceEvent
): WorkflowRunSnapshot {
  if (
    snapshot.status === "succeeded" ||
    snapshot.status === "failed" ||
    snapshot.status === "cancelled" ||
    snapshot.status === "interrupted"
  ) {
    invalidEvent(
      snapshot,
      event,
      `Run is already terminal: ${snapshot.status}`,
      "WORKFLOW_TERMINAL_RUN"
    );
  }

  const step = stepFor(snapshot);
  const timestamp = at(snapshot, event);

  if (event.type === "start-approved") {
    if (
      snapshot.status !== "awaiting_start_confirmation" ||
      snapshot.pendingDecision?.kind !== "start"
    ) {
      invalidEvent(snapshot, event, "Start decision is not pending");
    }
    return prepareCurrentStage(
      {
        ...withoutPending(withoutError(snapshot)),
        status: "running",
        updatedAt: timestamp,
      },
      timestamp
    );
  }

  if (event.type === "start-rejected") {
    if (
      snapshot.status !== "awaiting_start_confirmation" ||
      snapshot.pendingDecision?.kind !== "start"
    ) {
      invalidEvent(snapshot, event, "Start decision is not pending");
    }
    return terminalSnapshot(snapshot, "cancelled", timestamp, {
      code: "WORKFLOW_START_REJECTED",
      message: event.reason ?? "Workflow start was rejected",
    });
  }

  if (event.type === "action-approved") {
    if (
      snapshot.status !== "awaiting_action_confirmation" ||
      snapshot.pendingDecision?.kind !== "action" ||
      step.kind !== "action"
    ) {
      invalidEvent(snapshot, event, "Action decision is not pending");
    }
    return {
      ...withoutPending(withoutError(snapshot)),
      status: "running",
      updatedAt: timestamp,
    };
  }

  if (event.type === "action-rejected") {
    if (
      snapshot.status !== "awaiting_action_confirmation" ||
      snapshot.pendingDecision?.kind !== "action" ||
      step.kind !== "action"
    ) {
      invalidEvent(snapshot, event, "Action decision is not pending");
    }
    return terminalSnapshot(snapshot, "cancelled", timestamp, {
      code: "WORKFLOW_ACTION_REJECTED",
      message: event.reason ?? "Action was rejected",
      stageId: step.id,
    });
  }

  if (event.type === "gate-decision") {
    if (
      snapshot.status !== "awaiting_gate_decision" ||
      snapshot.pendingDecision?.kind !== "gate" ||
      step.kind !== "agent" ||
      step.gate?.type !== "human"
    ) {
      invalidEvent(snapshot, event, "Human gate decision is not pending");
    }
    return moveTo(snapshot, event, event.decision === "approve" ? "pass" : "fail");
  }

  if (event.type === "cancel") {
    return terminalSnapshot(snapshot, "cancelled", timestamp, {
      code: "WORKFLOW_CANCELLED",
      message: event.reason ?? "Workflow was cancelled",
      stageId: snapshot.currentStageId,
    });
  }

  if (event.type === "error") {
    return terminalSnapshot(snapshot, "failed", timestamp, event.error);
  }

  requireRunning(snapshot, event);

  if (event.type === "agent-completed") {
    if (step.kind !== "agent")
      invalidEvent(
        snapshot,
        event,
        "Agent completion does not match current stage",
        "WORKFLOW_STAGE_MISMATCH"
      );
    if (event.artifact.id !== step.produces.id || event.artifact.schema !== step.produces.schema) {
      invalidEvent(
        snapshot,
        event,
        "Agent artifact does not match the stage produces contract",
        "WORKFLOW_STAGE_MISMATCH"
      );
    }
    const withArtifact: WorkflowRunSnapshot = {
      ...snapshot,
      artifacts: { ...snapshot.artifacts, [event.artifact.id]: event.artifact.value },
      updatedAt: timestamp,
    };
    if (step.gate?.type === "human") {
      return {
        ...withArtifact,
        status: "awaiting_gate_decision",
        pendingDecision: {
          kind: "gate",
          prompt: step.gate.prompt,
          stageId: step.id,
        },
      };
    }
    if (step.gate) {
      return terminalSnapshot(withArtifact, "failed", timestamp, {
        code: "WORKFLOW_GATE_UNSUPPORTED",
        message: `Gate ${step.gate.type} cannot be evaluated by this runner`,
        stageId: step.id,
        feature: `gate.${step.gate.type}`,
      });
    }
    return moveTo(withArtifact, event, "pass");
  }

  if (event.type === "action-completed") {
    if (step.kind !== "action")
      invalidEvent(
        snapshot,
        event,
        "Action completion does not match current stage",
        "WORKFLOW_STAGE_MISMATCH"
      );
    const actionState = {
      ...(snapshot.actionState ?? { stageId: step.id, logPath: "" }),
      stageId: step.id,
      endedAt: timestamp,
      ...(event.exitCode === undefined ? {} : { exitCode: event.exitCode }),
      ...(event.signal ? { signal: event.signal } : {}),
    };
    const withAction: WorkflowRunSnapshot = { ...snapshot, actionState, updatedAt: timestamp };
    const outcome = event.exitCode === 0 && !event.signal ? "pass" : "fail";
    return moveTo(withAction, event, outcome);
  }

  if (event.type === "stage-failed") {
    if (event.error.stageId && event.error.stageId !== step.id) {
      invalidEvent(
        snapshot,
        event,
        "Stage failure does not match current stage",
        "WORKFLOW_STAGE_MISMATCH"
      );
    }
    return moveTo(snapshot, event, "fail");
  }

  if (event.type === "signal-received") {
    if (step.kind !== "wait")
      invalidEvent(
        snapshot,
        event,
        "Signal does not match current stage",
        "WORKFLOW_STAGE_MISMATCH"
      );
    return moveTo(snapshot, event, event.outcome === "pass" ? "signal" : "fail");
  }

  invalidEvent(snapshot, event, "Unhandled workflow event");
}
