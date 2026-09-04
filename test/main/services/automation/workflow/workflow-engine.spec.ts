import { describe, expect, it, vi } from "vitest";
import {
  WorkflowEngine,
  WorkflowEngineError,
  type WorkflowEngineDependencies,
} from "@main/services/automation/workflow/workflow-engine";
import type {
  WorkflowDefinition,
  WorkflowDefinitionRecord,
  WorkflowRunSnapshot,
} from "@shared/types/workflow";
import type {
  WorkflowRunOwner,
  WorkflowRunSnapshotEntry,
} from "@main/infra/storage/workflow-run-store";

function fixtureDefinition(overrides: Partial<WorkflowDefinition> = {}): WorkflowDefinition {
  return {
    name: "Engine fixture",
    version: 2,
    requires: [],
    confirmStart: false,
    stages: [
      {
        id: "action",
        kind: "action",
        op: { type: "exec", command: "true" },
        confirm: true,
        terminal: true,
      },
    ],
    ...overrides,
  };
}

function record(workflowId: string, definition = fixtureDefinition()): WorkflowDefinitionRecord {
  return {
    workflowId,
    name: definition.name,
    yaml: `name: ${definition.name}\nversion: 2\nstages: []`,
    definition,
  };
}

function createHarness(definition = fixtureDefinition()) {
  const definitions = new Map<string, WorkflowDefinitionRecord>([
    ["workspace-1/workflow-1", record("workflow-1", definition)],
  ]);
  const sessionDefinitions = new Map<string, WorkflowDefinitionRecord>();
  const snapshots = new Map<string, WorkflowRunSnapshot>();
  const owners = new Map<string, WorkflowRunOwner>();
  const wakes: unknown[] = [];
  const stageStarts: string[] = [];
  const cancelledOwners: string[] = [];
  const saveCalls: WorkflowRunSnapshot[] = [];
  const clock = vi.fn(() => "2026-09-01T00:00:01.000Z");
  let id = 0;
  let saveError: Error | null = null;
  let stageReadyHook: NonNullable<WorkflowEngineDependencies["onStageReady"]> = (
    _owner,
    snapshot
  ) => {
    stageStarts.push(snapshot.currentStageId);
  };

  const snapshotKey = (owner: Pick<WorkflowRunOwner, "workspaceId" | "workflowId" | "runId">) =>
    `${owner.workspaceId}/${owner.workflowId}/${owner.runId}`;
  const dependencies: Partial<WorkflowEngineDependencies> = {
    loadSessionDefinition: async (_workspaceId, _parentSessionId, workflowId) =>
      sessionDefinitions.get(workflowId) ?? null,
    loadDefinition: async (workspaceId, workflowId) =>
      definitions.get(`${workspaceId}/${workflowId}`) ?? null,
    listRunSnapshots: async (workspaceId, parentSessionId) =>
      [...snapshots.entries()].flatMap(([key, snapshot]) => {
        const owner = owners.get(key);
        if (
          !owner ||
          owner.workspaceId !== workspaceId ||
          owner.parentSessionId !== parentSessionId
        ) {
          return [];
        }
        return [{ owner, snapshot: structuredClone(snapshot) }];
      }),
    listRunEntries: async (workspaceId): Promise<WorkflowRunSnapshotEntry[]> =>
      [...snapshots.entries()].flatMap(([key, snapshot]) => {
        const owner = owners.get(key);
        if (!owner || owner.workspaceId !== workspaceId) return [];
        return [{ owner, snapshot: structuredClone(snapshot) }];
      }),
    loadRunSnapshot: async (owner) => {
      const snapshot = snapshots.get(snapshotKey(owner));
      return snapshot ? structuredClone(snapshot) : null;
    },
    saveRunSnapshot: async (owner, snapshot) => {
      if (saveError) throw saveError;
      const key = snapshotKey(owner);
      owners.set(key, owner);
      snapshots.set(key, structuredClone(snapshot));
      saveCalls.push(structuredClone(snapshot));
    },
    readTranscript: async () => "",
    appendTranscript: async () => undefined,
    createRunId: () => `run-${++id}`,
    now: clock,
    wake: (payload) => {
      wakes.push(payload);
    },
    onStageReady: (owner, snapshot) => stageReadyHook(owner, snapshot),
    cancelRunResources: (owner) => {
      cancelledOwners.push(owner.runId);
    },
  };

  return {
    dependencies,
    sessionDefinitions,
    snapshots,
    wakes,
    stageStarts,
    cancelledOwners,
    saveCalls,
    setSaveError: (error: Error | null) => {
      saveError = error;
    },
    setStageReadyHook: (hook: NonNullable<WorkflowEngineDependencies["onStageReady"]>) => {
      stageReadyHook = hook;
    },
    engine: new WorkflowEngine(dependencies),
  };
}

function chatCaller(parentSessionId = "session-1") {
  return {
    callerType: "chat" as const,
    workspaceId: "workspace-1",
    parentSessionId,
  };
}

describe("WorkflowEngine", () => {
  it("creates an atomic Workspace-owned Run, freezes the definition, wakes, and starts the first stage", async () => {
    const harness = createHarness();
    const result = await harness.engine.triggerWorkflow({
      workflowId: "workflow-1",
      caller: chatCaller(),
    });

    expect(result).toEqual({ status: "accepted", runId: "run-1", runStatus: "running" });
    expect(harness.saveCalls).toHaveLength(1);
    expect(harness.saveCalls[0]).toMatchObject({
      snapshotSchemaVersion: 1,
      workflowId: "workflow-1",
      parentSessionId: "session-1",
      currentStageId: "action",
      visitCounts: { action: 1 },
      artifacts: {},
      frozenDefinition: { version: 2, name: "Engine fixture" },
      definitionSource: "workspace",
    });
    expect(harness.wakes).toEqual([{ workspaceId: "workspace-1", runId: "run-1" }]);
    expect(harness.stageStarts).toEqual(["action"]);
  });

  it("prefers a parent Session shadow and preserves the frozen source after shadow deletion", async () => {
    const workspace = fixtureDefinition({ name: "Workspace definition" });
    const session = fixtureDefinition({ name: "Session shadow" });
    const harness = createHarness(workspace);
    harness.sessionDefinitions.set("workflow-1", record("workflow-1", session));

    const created = await harness.engine.triggerWorkflow({
      workflowId: "workflow-1",
      caller: chatCaller(),
    });
    const snapshot = [...harness.snapshots.values()][0];
    expect(snapshot).toMatchObject({
      workflowId: "workflow-1",
      definitionSource: "session",
      frozenDefinition: { name: "Session shadow" },
    });

    harness.sessionDefinitions.delete("workflow-1");
    await expect(
      harness.engine.getRunDetail({
        workspaceId: "workspace-1",
        parentSessionId: "session-1",
        runId: created.runId,
      })
    ).resolves.toMatchObject({
      runId: created.runId,
      workflowName: "Session shadow",
    });
  });

  it("serializes active-parent creation and rejects a second Run with a structured conflict", async () => {
    const harness = createHarness();
    const [first, second] = await Promise.allSettled([
      harness.engine.triggerWorkflow({ workflowId: "workflow-1", caller: chatCaller() }),
      harness.engine.triggerWorkflow({ workflowId: "workflow-1", caller: chatCaller() }),
    ]);

    expect(first.status).toBe("fulfilled");
    expect(second.status).toBe("rejected");
    expect(second.status === "rejected" ? second.reason : undefined).toBeInstanceOf(
      WorkflowEngineError
    );
    expect(second.status === "rejected" ? second.reason.code : undefined).toBe(
      "WORKFLOW_RUN_CONFLICT"
    );
    expect(harness.saveCalls).toHaveLength(1);
  });

  it("serializes concurrent decisions so only one event can consume a pending confirmation", async () => {
    const harness = createHarness(fixtureDefinition({ confirmStart: true }));
    const created = await harness.engine.triggerWorkflow({
      workflowId: "workflow-1",
      caller: chatCaller(),
    });

    const decisions = await Promise.allSettled([
      harness.engine.decideRun({
        workspaceId: "workspace-1",
        parentSessionId: "session-1",
        runId: created.runId,
        decision: "approve",
      }),
      harness.engine.decideRun({
        workspaceId: "workspace-1",
        parentSessionId: "session-1",
        runId: created.runId,
        decision: "reject",
      }),
    ]);

    expect(decisions.filter((decision) => decision.status === "fulfilled")).toHaveLength(1);
    expect(decisions.filter((decision) => decision.status === "rejected")).toHaveLength(1);
    expect([...harness.snapshots.values()][0]).toMatchObject({
      status: "awaiting_action_confirmation",
      pendingDecision: { kind: "action" },
    });
  });

  it("keeps start/action decisions in the same serialized Run queue and projects detail", async () => {
    const harness = createHarness(fixtureDefinition({ confirmStart: true }));
    const created = await harness.engine.triggerWorkflow({
      workflowId: "workflow-1",
      caller: chatCaller(),
    });
    expect(created.runStatus).toBe("awaiting_start_confirmation");

    const started = await harness.engine.decideRun({
      workspaceId: "workspace-1",
      parentSessionId: "session-1",
      runId: created.runId,
      decision: "approve",
    });
    expect(started).toMatchObject({
      status: "awaiting_action_confirmation",
      currentStageId: "action",
      pendingDecision: { kind: "action", stageId: "action" },
    });

    const cancelled = await harness.engine.decideRun({
      workspaceId: "workspace-1",
      parentSessionId: "session-1",
      runId: created.runId,
      decision: "reject",
    });
    expect(cancelled).toMatchObject({
      status: "cancelled",
      error: { code: "WORKFLOW_ACTION_REJECTED", stageId: "action" },
    });

    const detail = await harness.engine.getRunDetail({
      workspaceId: "workspace-1",
      parentSessionId: "session-1",
      runId: created.runId,
    });
    expect(detail).toMatchObject({
      runId: "run-1",
      workflowName: "Engine fixture",
      status: "cancelled",
      visitCounts: { action: 1 },
    });
    expect((await harness.engine.listRuns(chatCaller())).runs).toHaveLength(1);
    expect(harness.wakes).toHaveLength(3);
  });

  it("rejects non-chat triggers, preflights unsupported definitions, and does not persist a Run", async () => {
    const harness = createHarness(
      fixtureDefinition({
        stages: [
          {
            id: "wait",
            kind: "wait",
            for: "manual",
            terminal: true,
          },
        ],
      })
    );
    await expect(
      harness.engine.triggerWorkflow({
        workflowId: "workflow-1",
        caller: { ...chatCaller(), callerType: "spawned" },
      })
    ).rejects.toMatchObject({ code: "WORKFLOW_INVALID_CALLER" });
    await expect(
      harness.engine.triggerWorkflow({ workflowId: "workflow-1", caller: chatCaller() })
    ).rejects.toMatchObject({
      code: "WORKFLOW_FEATURE_NOT_IMPLEMENTED",
      details: {
        issues: [expect.objectContaining({ stageId: "wait", feature: "wait" })],
      },
    });
    expect(harness.saveCalls).toHaveLength(0);
    expect(harness.wakes).toHaveLength(0);
  });

  it("does not return a Run id when initial snapshot persistence fails", async () => {
    const harness = createHarness();
    harness.setSaveError(new Error("disk full"));
    await expect(
      harness.engine.triggerWorkflow({ workflowId: "workflow-1", caller: chatCaller() })
    ).rejects.toMatchObject({
      code: "WORKFLOW_RUN_PERSIST_FAILED",
      details: { runId: "run-1" },
    });
    expect(harness.wakes).toHaveLength(0);
    expect(harness.stageStarts).toHaveLength(0);
  });

  it("marks active Runs interrupted during disposal while preserving their owner snapshot", async () => {
    const harness = createHarness();
    const created = await harness.engine.triggerWorkflow({
      workflowId: "workflow-1",
      caller: chatCaller(),
    });
    await harness.engine.dispose();

    const persisted = [...harness.snapshots.values()][0];
    expect(persisted).toMatchObject({
      runId: created.runId,
      parentSessionId: "session-1",
      status: "interrupted",
      error: { code: "APP_SHUTDOWN", stageId: "action" },
    });
    expect(harness.cancelledOwners).toContain(created.runId);
    await expect(
      harness.engine.triggerWorkflow({ workflowId: "workflow-1", caller: chatCaller() })
    ).rejects.toMatchObject({ code: "WORKFLOW_ENGINE_SHUTTING_DOWN" });
  });

  it("hides Runs owned by another parent", async () => {
    const harness = createHarness();
    const created = await harness.engine.triggerWorkflow({
      workflowId: "workflow-1",
      caller: chatCaller(),
    });
    await expect(
      harness.engine.getRunDetail({
        workspaceId: "workspace-1",
        parentSessionId: "other-session",
        runId: created.runId,
      })
    ).rejects.toMatchObject({ code: "WORKFLOW_RUN_NOT_FOUND" });
  });

  it("reconciles awaiting decisions without replaying the current stage", async () => {
    const harness = createHarness(fixtureDefinition({ confirmStart: true }));
    const created = await harness.engine.triggerWorkflow({
      workflowId: "workflow-1",
      caller: chatCaller(),
    });

    const result = await harness.engine.reconcile("workspace-1");

    expect(result).toMatchObject({ recovered: [created.runId], interrupted: [], incompatible: [] });
    expect([...harness.snapshots.values()][0]).toMatchObject({
      status: "awaiting_start_confirmation",
      pendingDecision: { kind: "start" },
    });
    expect(harness.stageStarts).toHaveLength(0);
  });

  it("marks a running snapshot interrupted without losing artifacts or action metadata", async () => {
    const harness = createHarness();
    const created = await harness.engine.triggerWorkflow({
      workflowId: "workflow-1",
      caller: chatCaller(),
    });
    const key = [...harness.snapshots.keys()][0];
    const current = harness.snapshots.get(key);
    if (!current) throw new Error("expected persisted workflow snapshot");
    harness.snapshots.set(key, {
      ...current,
      artifacts: { report: "kept" },
      actionState: {
        stageId: current.currentStageId,
        logPath: "action-outputs/action.log",
        startedAt: "2026-09-01T00:00:00.500Z",
      },
    });

    const result = await harness.engine.reconcile("workspace-1");
    const reconciled = [...harness.snapshots.values()][0];

    expect(result.interrupted).toEqual([created.runId]);
    expect(reconciled).toMatchObject({
      runId: created.runId,
      status: "interrupted",
      error: { code: "APP_RESTARTED" },
      artifacts: { report: "kept" },
      actionState: { logPath: "action-outputs/action.log" },
    });
    expect(harness.stageStarts).toEqual(["action"]);
  });

  it("force-disposes active Runs while rejecting late triggers", async () => {
    const harness = createHarness();
    const created = await harness.engine.triggerWorkflow({
      workflowId: "workflow-1",
      caller: chatCaller(),
    });

    harness.engine.forceDispose();

    await vi.waitFor(() =>
      expect([...harness.snapshots.values()][0]).toMatchObject({
        runId: created.runId,
        status: "interrupted",
        error: { code: "APP_SHUTDOWN" },
      })
    );
    await expect(
      harness.engine.triggerWorkflow({ workflowId: "workflow-1", caller: chatCaller() })
    ).rejects.toMatchObject({ code: "WORKFLOW_ENGINE_SHUTTING_DOWN" });
  });

  it("cancels every non-terminal Run before parent session storage is removed", async () => {
    const harness = createHarness();
    const created = await harness.engine.triggerWorkflow({
      workflowId: "workflow-1",
      caller: chatCaller(),
    });

    await harness.engine.cancelRunsByParentSession("workspace-1", "session-1");

    expect([...harness.snapshots.values()][0]).toMatchObject({
      runId: created.runId,
      status: "cancelled",
      error: { code: "WORKFLOW_CANCELLED" },
    });
    expect(harness.cancelledOwners).toContain(created.runId);
  });

  it("writes structured incompatibility for invalid snapshot schema or current stage", async () => {
    const harness = createHarness();
    await harness.engine.triggerWorkflow({ workflowId: "workflow-1", caller: chatCaller() });
    const key = [...harness.snapshots.keys()][0];
    const current = harness.snapshots.get(key);
    if (!current) throw new Error("expected persisted workflow snapshot");
    const corrupt = structuredClone(current) as Omit<
      WorkflowRunSnapshot,
      "snapshotSchemaVersion"
    > & {
      snapshotSchemaVersion: number;
    };
    corrupt.snapshotSchemaVersion = 9;
    harness.snapshots.set(key, corrupt as unknown as WorkflowRunSnapshot);

    const result = await harness.engine.reconcile("workspace-1");

    expect(result.incompatible).toEqual([current.runId]);
    expect([...harness.snapshots.values()][0]).toMatchObject({
      status: "interrupted",
      error: { code: "WORKFLOW_SNAPSHOT_INCOMPATIBLE" },
    });
  });

  it("runs an Agent to human Gate to Action to terminal through one engine queue", async () => {
    const definition = fixtureDefinition({
      stages: [
        {
          id: "agent",
          kind: "agent",
          context: "fresh",
          prompt: "inspect",
          produces: { id: "answer", schema: "freeform" },
          gate: { type: "human", prompt: "Approve the result" },
          next: [{ on: "pass", goto: "action" }],
        },
        {
          id: "action",
          kind: "action",
          op: { type: "exec", command: "true" },
          confirm: false,
          terminal: true,
        },
      ],
    });
    const harness = createHarness(definition);
    const stageStarts: string[] = [];
    harness.setStageReadyHook(async (owner, snapshot) => {
      stageStarts.push(snapshot.currentStageId);
      if (snapshot.currentStageId === "agent") {
        await harness.engine.advanceRun(owner, {
          type: "agent-completed",
          artifact: { id: "answer", schema: "freeform", value: "approved answer" },
        });
      } else {
        await harness.engine.advanceRun(owner, { type: "action-completed", exitCode: 0 });
      }
    });

    const created = await harness.engine.triggerWorkflow({
      workflowId: "workflow-1",
      caller: chatCaller(),
    });
    await vi.waitFor(() =>
      expect([...harness.snapshots.values()][0]).toMatchObject({
        status: "awaiting_gate_decision",
        artifacts: { answer: "approved answer" },
      })
    );

    await harness.engine.decideRun({
      workspaceId: "workspace-1",
      parentSessionId: "session-1",
      runId: created.runId,
      decision: "approve",
    });
    await vi.waitFor(() =>
      expect([...harness.snapshots.values()][0]).toMatchObject({
        status: "succeeded",
        currentStageId: "action",
      })
    );

    expect(stageStarts).toEqual(["agent", "action"]);
    expect([...harness.snapshots.values()][0]).toMatchObject({
      visitCounts: { agent: 1, action: 1 },
      artifacts: { answer: "approved answer" },
      actionState: { stageId: "action" },
    });
  });
});
