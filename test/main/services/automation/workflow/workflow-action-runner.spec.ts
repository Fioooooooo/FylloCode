import { PassThrough } from "node:stream";
import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import {
  WorkflowActionRunner,
  resolveWorkflowActionCwd,
} from "@main/services/automation/workflow/workflow-action-runner";
import type { WorkflowRunOwner } from "@main/infra/storage/workflow-run-store";
import type { WorkflowRunSnapshot } from "@shared/types/workflow";
import type { SessionExecutionContext } from "@main/services/session/chat/chat-service";

class FakeChild extends EventEmitter {
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  readonly kill = vi.fn((signal: NodeJS.Signals = "SIGTERM") => {
    this.signalCode = signal;
    this.emit("close", null, signal);
    return true;
  });
}

const owner: WorkflowRunOwner = {
  workspaceId: "workspace-1",
  workflowId: "workflow-1",
  runId: "run-1",
  parentSessionId: "session-1",
};

const parentContext: SessionExecutionContext = {
  agentId: "agent-1",
  workspaceSnapshot: {
    workspaceId: "workspace-1",
    workspaceKind: "folder",
    primaryFolderId: "folder-1",
    folders: [{ folderId: "folder-1", folderName: "Repo", folderPath: "/repo" }],
    cwd: "/repo",
    additionalDirectories: [],
  },
};

function fixture(
  status: WorkflowRunSnapshot["status"] = "running",
  cwd?: string
): WorkflowRunSnapshot {
  return {
    snapshotSchemaVersion: 1,
    runId: owner.runId,
    workflowId: owner.workflowId,
    parentSessionId: owner.parentSessionId,
    frozenDefinition: {
      name: "Action",
      version: 2,
      requires: [],
      stages: [
        {
          id: "run-tests",
          kind: "action",
          op: { type: "exec", command: "printf action", ...(cwd === undefined ? {} : { cwd }) },
          confirm: false,
          terminal: true,
        },
      ],
    },
    status,
    currentStageId: "run-tests",
    visitCounts: { "run-tests": 1 },
    artifacts: {},
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  };
}

function createHarness(initial = fixture()) {
  let snapshot = initial;
  const child = new FakeChild();
  const updates: WorkflowRunSnapshot[] = [];
  const advances: unknown[] = [];
  const output: string[] = [];
  const spawnCommand = vi.fn(() => child as unknown as ChildProcessWithoutNullStreams);
  const runner = new WorkflowActionRunner(
    {
      updateRun: async (_owner, updater) => {
        const next = updater(structuredClone(snapshot));
        if (!next) return null;
        snapshot = structuredClone(next);
        updates.push(structuredClone(next));
        return next;
      },
      advanceRun: async (_owner, event) => {
        advances.push(event);
      },
    },
    {
      getParentExecutionContext: async () => parentContext,
      appendActionLog: async (_owner, _stageId, chunk) => {
        output.push(chunk.toString());
      },
      spawnCommand,
      trackProcess: vi.fn(),
      now: () => "2026-09-01T00:00:01.000Z",
    }
  );
  return {
    runner,
    child,
    spawnCommand,
    updates,
    advances,
    output,
    get snapshot() {
      return snapshot;
    },
  };
}

describe("WorkflowActionRunner", () => {
  it("does not create a process before Action confirmation and records merged output/result", async () => {
    const waiting = createHarness(fixture("awaiting_action_confirmation"));
    await waiting.runner.startStage(owner, waiting.snapshot);
    expect(waiting.spawnCommand).not.toHaveBeenCalled();

    const harness = createHarness();
    const running = harness.runner.startStage(owner, harness.snapshot);
    await vi.waitFor(() => expect(harness.spawnCommand).toHaveBeenCalledTimes(1));
    expect(harness.spawnCommand).toHaveBeenCalledWith("printf action", "/repo");

    harness.child.stdout.write("stdout\n");
    harness.child.stderr.write("stderr\n");
    harness.child.exitCode = 0;
    harness.child.emit("close", 0, null);
    await running;

    expect(harness.output).toEqual(["stdout\n", "stderr\n"]);
    expect(harness.snapshot.actionState).toMatchObject({
      stageId: "run-tests",
      logPath: "action-outputs/run-tests.log",
      startedAt: "2026-09-01T00:00:01.000Z",
      endedAt: "2026-09-01T00:00:01.000Z",
      exitCode: 0,
    });
    expect(harness.advances).toEqual([{ type: "action-completed", exitCode: 0 }]);
  });

  it("rejects a cwd outside the parent frozen Workspace snapshot", async () => {
    const harness = createHarness(fixture("running", "../outside"));
    const running = harness.runner.startStage(owner, harness.snapshot);
    await running;

    expect(harness.spawnCommand).not.toHaveBeenCalled();
    expect(harness.advances[0]).toMatchObject({
      type: "stage-failed",
      error: { code: "WORKFLOW_ACTION_CWD_FORBIDDEN", stageId: "run-tests" },
    });
    expect(() => resolveWorkflowActionCwd(parentContext.workspaceSnapshot, "/outside")).toThrow(
      "Action cwd is outside"
    );
  });

  it("cancels the owned child without adding an Action completion event", async () => {
    const harness = createHarness();
    const running = harness.runner.startStage(owner, harness.snapshot);
    await vi.waitFor(() => expect(harness.spawnCommand).toHaveBeenCalledTimes(1));

    await harness.runner.cancel(owner);
    await running;

    expect(harness.child.kill).toHaveBeenCalledWith("SIGTERM");
    expect(harness.snapshot.actionState).toMatchObject({ endedAt: "2026-09-01T00:00:01.000Z" });
    expect(harness.advances).toHaveLength(0);
  });

  it("sends error event when action exits with code 127 (command not found)", async () => {
    const harness = createHarness();
    const running = harness.runner.startStage(owner, harness.snapshot);
    await vi.waitFor(() => expect(harness.spawnCommand).toHaveBeenCalledTimes(1));

    harness.child.exitCode = 127;
    harness.child.emit("close", 127, null);
    await running;

    expect(harness.snapshot.actionState).toMatchObject({
      stageId: "run-tests",
      exitCode: 127,
    });
    expect(harness.advances).toEqual([
      {
        type: "error",
        error: {
          code: "ACTION_EXECUTION_ERROR",
          message: "Command not found in action stage 'run-tests'",
          stageId: "run-tests",
        },
      },
    ]);
  });

  it("sends error event when action process is terminated by signal", async () => {
    const harness = createHarness();
    const running = harness.runner.startStage(owner, harness.snapshot);
    await vi.waitFor(() => expect(harness.spawnCommand).toHaveBeenCalledTimes(1));

    harness.child.signalCode = "SIGKILL";
    harness.child.emit("close", null, "SIGKILL");
    await running;

    expect(harness.snapshot.actionState).toMatchObject({
      stageId: "run-tests",
      signal: "SIGKILL",
    });
    expect(harness.advances).toEqual([
      {
        type: "error",
        error: {
          code: "ACTION_EXECUTION_ERROR",
          message: "Action process terminated by signal: SIGKILL",
          stageId: "run-tests",
        },
      },
    ]);
  });

  it("sends action-completed event with fail outcome when action exits with code 1-126", async () => {
    const harness = createHarness();
    const running = harness.runner.startStage(owner, harness.snapshot);
    await vi.waitFor(() => expect(harness.spawnCommand).toHaveBeenCalledTimes(1));

    harness.child.exitCode = 1;
    harness.child.emit("close", 1, null);
    await running;

    expect(harness.snapshot.actionState).toMatchObject({
      stageId: "run-tests",
      exitCode: 1,
    });
    expect(harness.advances).toEqual([{ type: "action-completed", exitCode: 1 }]);
  });
});
