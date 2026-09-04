import { describe, expect, it } from "vitest";
import {
  advance,
  WorkflowStateMachineError,
  type WorkflowAdvanceEvent,
} from "@main/domain/automation/workflow/state-machine";
import type { WorkflowDefinition, WorkflowRunSnapshot } from "@shared/types/workflow";

const timestamps = {
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:01.000Z",
};

function definition(overrides: Partial<WorkflowDefinition> = {}): WorkflowDefinition {
  return {
    name: "State machine fixture",
    version: 2,
    requires: [],
    confirmStart: false,
    stages: [
      {
        id: "agent",
        kind: "agent",
        context: "fresh",
        prompt: "Inspect the repository",
        produces: { id: "result", schema: "freeform" },
        gate: { type: "human", prompt: "Review the agent result" },
        next: [
          { on: "pass", goto: "action" },
          { on: "fail", goto: "reject" },
        ],
      },
      {
        id: "action",
        kind: "action",
        op: { type: "exec", command: "true" },
        confirm: true,
        next: [{ on: "pass", goto: "finish" }],
      },
      {
        id: "finish",
        kind: "action",
        op: { type: "exec", command: "true" },
        confirm: false,
        terminal: true,
      },
      {
        id: "reject",
        kind: "action",
        op: { type: "exec", command: "true" },
        confirm: false,
        terminal: true,
      },
    ],
    ...overrides,
  };
}

function snapshot(
  currentStageId = "agent",
  overrides: Partial<WorkflowRunSnapshot> = {}
): WorkflowRunSnapshot {
  return {
    snapshotSchemaVersion: 1,
    runId: "run-1",
    workflowId: "workflow-1",
    parentSessionId: "session-1",
    frozenDefinition: definition(),
    status: "running",
    currentStageId,
    visitCounts: { [currentStageId]: 1 },
    artifacts: {},
    ...timestamps,
    ...overrides,
  };
}

function expectStateError(action: () => unknown, code: WorkflowStateMachineError["code"]) {
  try {
    action();
    throw new Error("Expected workflow state machine to reject the event");
  } catch (error) {
    expect(error).toBeInstanceOf(WorkflowStateMachineError);
    expect((error as WorkflowStateMachineError).code).toBe(code);
    expect((error as WorkflowStateMachineError).details.eventType).toBeDefined();
  }
}

describe("workflow state machine", () => {
  it("runs an Agent through a human gate, confirmed Action, and terminal stage", () => {
    const artifact = { id: "result", schema: "freeform" as const, value: "ready" };
    const waitingForGate = advance(snapshot(), {
      type: "agent-completed",
      artifact,
      at: "2026-09-01T00:00:02.000Z",
    });

    expect(waitingForGate).toMatchObject({
      status: "awaiting_gate_decision",
      currentStageId: "agent",
      artifacts: { result: "ready" },
      pendingDecision: {
        kind: "gate",
        stageId: "agent",
      },
    });

    const waitingForAction = advance(waitingForGate, {
      type: "gate-decision",
      decision: "approve",
      at: "2026-09-01T00:00:03.000Z",
    });
    expect(waitingForAction).toMatchObject({
      status: "awaiting_action_confirmation",
      currentStageId: "action",
      pendingDecision: { kind: "action", stageId: "action" },
      visitCounts: { agent: 1, action: 1 },
    });

    const runningAction = advance(waitingForAction, {
      type: "action-approved",
      at: "2026-09-01T00:00:04.000Z",
    });
    expect(runningAction).toMatchObject({
      status: "running",
      currentStageId: "action",
    });
    expect(runningAction.pendingDecision).toBeUndefined();

    const runningFinish = advance(runningAction, {
      type: "action-completed",
      exitCode: 0,
      at: "2026-09-01T00:00:05.000Z",
    });
    expect(runningFinish).toMatchObject({
      status: "running",
      currentStageId: "finish",
      visitCounts: { agent: 1, action: 1, finish: 1 },
    });

    const succeeded = advance(runningFinish, {
      type: "action-completed",
      exitCode: 0,
      at: "2026-09-01T00:00:06.000Z",
    });
    expect(succeeded).toMatchObject({
      status: "succeeded",
      currentStageId: "finish",
    });
    expect(succeeded.pendingDecision).toBeUndefined();
    expect(succeeded.error).toBeUndefined();
  });

  it("takes the human gate fail transition and preserves a terminal branch", () => {
    const waitingForGate = advance(snapshot(), {
      type: "agent-completed",
      artifact: { id: "result", schema: "freeform", value: "needs work" },
    });
    const waitingForRejectAction = advance(waitingForGate, {
      type: "gate-decision",
      decision: "reject",
    });

    expect(waitingForRejectAction).toMatchObject({
      status: "running",
      currentStageId: "reject",
      visitCounts: { agent: 1, reject: 1 },
    });

    const rejectedBranchSucceeded = advance(waitingForRejectAction, {
      type: "action-completed",
      exitCode: 0,
    });
    expect(rejectedBranchSucceeded.status).toBe("succeeded");
  });

  it("uses fail and signal transitions and reports maxLoops as a structured error", () => {
    const failingAction = snapshot("retry", {
      frozenDefinition: {
        name: "Loop fixture",
        version: 2,
        requires: [],
        stages: [
          {
            id: "retry",
            kind: "action",
            op: { type: "exec", command: "false" },
            confirm: false,
            next: [{ on: "fail", goto: "retry", maxLoops: 1 }],
          },
        ],
      },
    });

    const failed = advance(failingAction, {
      type: "action-completed",
      exitCode: 1,
      at: "2026-09-01T00:00:02.000Z",
    });
    expect(failed).toMatchObject({
      status: "failed",
      currentStageId: "retry",
      visitCounts: { retry: 1 },
      error: {
        code: "WORKFLOW_MAX_LOOPS_EXCEEDED",
        stageId: "retry",
        feature: "maxLoops",
      },
    });

    const signalDefinition: WorkflowDefinition = {
      name: "Signal fixture",
      version: 2,
      requires: [],
      stages: [
        {
          id: "wait",
          kind: "wait",
          for: "manual",
          next: [{ on: "signal", goto: "done" }],
        },
        {
          id: "done",
          kind: "action",
          op: { type: "exec", command: "true" },
          confirm: false,
          terminal: true,
        },
      ],
    };
    const signalled = advance(snapshot("wait", { frozenDefinition: signalDefinition }), {
      type: "signal-received",
      outcome: "pass",
    });
    expect(signalled).toMatchObject({ status: "running", currentStageId: "done" });
  });

  it("clears a previous Agent session before entering a later Agent stage", () => {
    const twoAgentDefinition: WorkflowDefinition = {
      name: "Two Agent fixture",
      version: 2,
      requires: [],
      stages: [
        {
          id: "action",
          kind: "action",
          op: { type: "exec", command: "true" },
          confirm: false,
          next: [{ on: "pass", goto: "review" }],
        },
        {
          id: "review",
          kind: "agent",
          context: "fresh",
          prompt: "Review the repository",
          produces: { id: "review-result", schema: "freeform" },
          terminal: true,
        },
      ],
    };

    const nextAgent = advance(
      snapshot("action", {
        frozenDefinition: twoAgentDefinition,
        agentSessionState: { sessionId: "workflow-session-previous" },
        artifacts: { inspection: "previous result" },
      }),
      { type: "action-completed", exitCode: 0 }
    );

    expect(nextAgent).toMatchObject({
      status: "running",
      currentStageId: "review",
    });
    expect(nextAgent.agentSessionState).toBeUndefined();
  });

  it("cancels rejected confirmations and rejects duplicate or late decisions", () => {
    const awaitingStart = snapshot("agent", {
      status: "awaiting_start_confirmation",
      pendingDecision: { kind: "start", prompt: "Start?" },
    });
    const cancelled = advance(awaitingStart, {
      type: "start-rejected",
      reason: "Not now",
    });
    expect(cancelled).toMatchObject({
      status: "cancelled",
      error: { code: "WORKFLOW_START_REJECTED" },
    });
    expectStateError(() => advance(cancelled, { type: "start-approved" }), "WORKFLOW_TERMINAL_RUN");

    const waitingForAction = advance(
      advance(snapshot(), {
        type: "agent-completed",
        artifact: { id: "result", schema: "freeform", value: "ready" },
      }),
      { type: "gate-decision", decision: "approve" }
    );
    const actionCancelled = advance(waitingForAction, {
      type: "action-rejected",
      reason: "No permission",
    });
    expect(actionCancelled).toMatchObject({
      status: "cancelled",
      error: { code: "WORKFLOW_ACTION_REJECTED", stageId: "action" },
    });

    const actionRunning = advance(waitingForAction, { type: "action-approved" });
    expectStateError(
      () => advance(actionRunning, { type: "action-approved" }),
      "WORKFLOW_INVALID_EVENT"
    );
    expectStateError(
      () => advance(snapshot(), { type: "gate-decision", decision: "approve" }),
      "WORKFLOW_INVALID_EVENT"
    );
  });

  it("rejects completion events for the wrong stage with structured details", () => {
    const event: WorkflowAdvanceEvent = {
      type: "action-completed",
      exitCode: 0,
    };
    expectStateError(() => advance(snapshot(), event), "WORKFLOW_STAGE_MISMATCH");
  });
});
