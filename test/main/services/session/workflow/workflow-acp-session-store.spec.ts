import { describe, expect, it, vi } from "vitest";
import {
  WorkflowAcpSessionStore,
  type WorkflowSessionOwner,
} from "@main/services/session/workflow/workflow-acp-session-store";
import type { WorkflowRunOwner } from "@main/infra/storage/workflow-run-store";
import type { WorkflowRunSnapshot } from "@shared/types/workflow";

function owner(): WorkflowSessionOwner {
  return {
    workspaceId: "workspace-1",
    workflowId: "workflow-1",
    runId: "run-1",
    parentSessionId: "session-1",
    sessionId: "workflow-session-1",
  };
}

function snapshot(): WorkflowRunSnapshot {
  return {
    snapshotSchemaVersion: 1,
    runId: "run-1",
    workflowId: "workflow-1",
    parentSessionId: "session-1",
    frozenDefinition: {
      name: "Workflow",
      version: 2,
      requires: [],
      stages: [
        {
          id: "agent",
          kind: "agent",
          context: "fresh",
          prompt: "Prompt",
          produces: { id: "result", schema: "freeform" },
          terminal: true,
        },
      ],
    },
    status: "running",
    currentStageId: "agent",
    visitCounts: { agent: 1 },
    artifacts: {},
    agentSessionState: { sessionId: "workflow-session-1" },
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  };
}

describe("WorkflowAcpSessionStore", () => {
  it("loads and patches ACP identity only in the workflow Run snapshot", async () => {
    let current = snapshot();
    const saveSnapshot = vi.fn(async (_owner: WorkflowRunOwner, next: WorkflowRunSnapshot) => {
      current = structuredClone(next);
    });
    const store = new WorkflowAcpSessionStore(owner(), {
      loadSnapshot: async () => structuredClone(current),
      saveSnapshot,
      now: () => "2026-09-01T00:00:01.000Z",
    });

    await expect(store.loadRecoveryState()).resolves.toEqual({
      acpSessionId: null,
      configOptions: [],
    });
    await store.persistAcpSessionId("acp-1");

    expect(saveSnapshot).toHaveBeenCalledOnce();
    expect(current.agentSessionState).toEqual({
      sessionId: "workflow-session-1",
      acpSessionId: "acp-1",
    });
    expect(current.updatedAt).toBe("2026-09-01T00:00:01.000Z");
    await expect(store.loadRecoveryState()).resolves.toEqual({
      acpSessionId: "acp-1",
      configOptions: [],
    });
  });

  it("does not accept a snapshot for another workflow session owner", async () => {
    const wrong = snapshot();
    wrong.agentSessionState = { sessionId: "other-session" };
    const store = new WorkflowAcpSessionStore(owner(), {
      loadSnapshot: async () => wrong,
      saveSnapshot: vi.fn(),
      now: () => "2026-09-01T00:00:01.000Z",
    });

    await expect(store.persistAcpSessionId("acp-1")).rejects.toMatchObject({
      code: "WORKFLOW_SESSION_OWNER_MISMATCH",
    });
  });
});
