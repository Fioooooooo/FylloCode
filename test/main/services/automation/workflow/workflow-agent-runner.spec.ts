import { describe, expect, it, vi } from "vitest";
import type { Message } from "@shared/types/chat";
import type { AcpSession, AcpSessionOpts } from "@main/services/session/chat/acp-session";
import {
  WorkflowAgentRunner,
  type WorkflowAgentRunnerEngine,
} from "@main/services/automation/workflow/workflow-agent-runner";
import type { WorkflowRunOwner } from "@main/infra/storage/workflow-run-store";
import type { WorkflowRunSnapshot } from "@shared/types/workflow";
import type { SessionExecutionContext } from "@main/services/session/chat/chat-service";
import type { McpWorkspaceDescriptorV2 } from "@shared/types/mcp-workspace";
import {
  driveAcpTurn,
  type AcpTurnCompletion,
  type AcpTurnRunner,
} from "@main/services/session/chat/acp-stream-driver";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

const owner: WorkflowRunOwner = {
  workspaceId: "workspace-1",
  workflowId: "workflow-1",
  runId: "run-1",
  parentSessionId: "session-1",
};

const parentContext: SessionExecutionContext = {
  agentId: "agent-default",
  workspaceSnapshot: {
    workspaceId: "workspace-1",
    workspaceKind: "folder",
    primaryFolderId: "folder-1",
    folders: [{ folderId: "folder-1", folderName: "Repo", folderPath: "/repo" }],
    cwd: "/repo",
    additionalDirectories: [],
  },
};

function fixture(): WorkflowRunSnapshot {
  return {
    snapshotSchemaVersion: 1,
    runId: owner.runId,
    workflowId: owner.workflowId,
    parentSessionId: owner.parentSessionId,
    frozenDefinition: {
      name: "Fresh agent",
      version: 2,
      requires: [],
      stages: [
        {
          id: "agent-stage",
          kind: "agent",
          context: "fresh",
          prompt: "Inspect the repository",
          produces: { id: "answer", schema: "freeform" },
          terminal: true,
        },
      ],
    },
    status: "running",
    currentStageId: "agent-stage",
    visitCounts: { "agent-stage": 1 },
    artifacts: {},
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  };
}

function createHarness() {
  let snapshot = fixture();
  const updates: WorkflowRunSnapshot[] = [];
  const advances: unknown[] = [];
  const transcript: unknown[] = [];
  const sessionOptions: unknown[] = [];
  const descriptor = { version: 2, workspaceId: owner.workspaceId } as McpWorkspaceDescriptorV2;
  const completion = deferred<AcpTurnCompletion>();
  const start = vi.fn(async () => undefined);
  const cancel = vi.fn();
  const turnRunner: AcpTurnRunner = { start, cancel, completion: completion.promise };
  const driveTurn = vi.fn((() => turnRunner) as typeof driveAcpTurn);
  const fakeSession = {} as AcpSession;
  const createSession = vi.fn((options: AcpSessionOpts): AcpSession => {
    sessionOptions.push(options);
    return fakeSession;
  });
  const engine: WorkflowAgentRunnerEngine = {
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
    appendTranscript: async (_owner, _sessionId, line) => {
      transcript.push(line);
    },
  };
  const runner = new WorkflowAgentRunner(engine, {
    getParentExecutionContext: async () => parentContext,
    createWorkspaceDescriptor: async () => descriptor,
    createSession,
    driveTurn,
    newSessionId: () => "workflow-session-1",
    now: () => "2026-09-01T00:00:01.000Z",
  });
  return {
    runner,
    completion,
    start,
    cancel,
    driveTurn,
    sessionOptions,
    updates,
    advances,
    transcript,
    get snapshot() {
      return snapshot;
    },
  };
}

function assistantMessage(text: string): Message {
  const now = new Date("2026-09-01T00:00:02.000Z");
  return {
    id: "assistant-1",
    role: "assistant",
    parts: [{ type: "text", text }],
    metadata: { sessionId: "workflow-session-1", createdAt: now, updatedAt: now },
  };
}

describe("WorkflowAgentRunner", () => {
  it("persists a logical session before ACP, isolates the session, patches ACP id, and stores a freeform artifact", async () => {
    const harness = createHarness();
    const running = harness.runner.startStage(owner, fixture());
    await vi.waitFor(() => expect(harness.driveTurn).toHaveBeenCalledTimes(1));

    expect(harness.snapshot.agentSessionState).toEqual({ sessionId: "workflow-session-1" });
    const options = harness.sessionOptions[0] as {
      owner: string;
      fylloSessionId: string;
      workspaceSnapshot: unknown;
      mcpWorkspaceDescriptor: unknown;
      sessionStore: { persistAcpSessionId(id: string): Promise<void> };
    };
    expect(options).toMatchObject({
      owner: "workflow",
      fylloSessionId: "workflow-session-1",
      workspaceSnapshot: parentContext.workspaceSnapshot,
      mcpWorkspaceDescriptor: { version: 2, workspaceId: owner.workspaceId },
    });
    expect(options.sessionStore).toBeDefined();

    await options.sessionStore.persistAcpSessionId("acp-session-1");
    expect(harness.snapshot.agentSessionState).toEqual({
      sessionId: "workflow-session-1",
      acpSessionId: "acp-session-1",
    });

    harness.completion.resolve({
      status: "done",
      totalTokens: 12,
      message: assistantMessage("final answer"),
    });
    await running;

    expect(harness.start).toHaveBeenCalledTimes(1);
    expect(harness.transcript).toHaveLength(2);
    expect(harness.transcript[0]).toMatchObject({
      role: "user",
      sessionId: "workflow-session-1",
      content: "Inspect the repository",
    });
    expect(harness.transcript[1]).toMatchObject({
      role: "assistant",
      text: "final answer",
    });
    expect(harness.advances).toEqual([
      {
        type: "agent-completed",
        artifact: { id: "answer", schema: "freeform", value: "final answer" },
      },
    ]);
  });

  it("writes ACP failures to the Run transcript and projects a stage failure", async () => {
    const harness = createHarness();
    const running = harness.runner.startStage(owner, fixture());
    await vi.waitFor(() => expect(harness.driveTurn).toHaveBeenCalledTimes(1));

    harness.completion.resolve({
      status: "error",
      code: "ACP_ERROR",
      message: "agent unavailable",
      partialMessage: assistantMessage("partial"),
    });
    await running;

    expect(harness.transcript[1]).toMatchObject({
      kind: "error",
      code: "ACP_ERROR",
      message: "agent unavailable",
      partialText: "partial",
    });
    expect(harness.advances).toHaveLength(1);
    expect(harness.advances[0]).toMatchObject({
      type: "stage-failed",
      error: {
        code: "WORKFLOW_AGENT_TURN_FAILED",
        stageId: "agent-stage",
      },
    });
  });

  it("cancels only the workflow-owned active turn and does not convert cancellation into stage failure", async () => {
    const harness = createHarness();
    const running = harness.runner.startStage(owner, fixture());
    await vi.waitFor(() => expect(harness.driveTurn).toHaveBeenCalledTimes(1));

    harness.runner.cancel(owner);
    expect(harness.cancel).toHaveBeenCalledTimes(1);
    harness.completion.resolve({ status: "cancelled", partialMessage: null });
    await running;

    expect(harness.advances).toHaveLength(0);
  });
});
