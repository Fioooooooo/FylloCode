import { describe, expect, it, vi } from "vitest";
import type {
  WorkflowDefinitionRecord,
  WorkflowProposalConfirmRequest,
  WorkflowProposalStatus,
} from "@shared/types/workflow";
import {
  WorkflowProposalService,
  type WorkflowProposalServiceDependencies,
} from "@main/services/automation/workflow/workflow-proposal-service";
import type {
  SaveWorkflowProposalInput,
  WorkflowProposalMeta,
  WorkflowProposalRecord,
} from "@main/infra/storage/workflow-proposal-store";
import type { WorkflowDecisionRecord } from "@main/infra/storage/workflow-decision-store";

const timestamp = "2026-09-02T00:00:00.000Z";
const owner = { workspaceId: "workspace-1", parentSessionId: "session-1" };
const yaml = [
  "name: Proposed workflow",
  "version: 2",
  "stages:",
  "  - id: inspect",
  "    kind: agent",
  "    context: fresh",
  "    prompt: Inspect the repository",
  "    produces: { id: result, schema: freeform }",
  "    terminal: true",
].join("\n");

function definitionRecord(workflowId: string): WorkflowDefinitionRecord {
  return {
    workflowId,
    name: "Existing workflow",
    yaml,
    definition: {
      name: "Existing workflow",
      version: 2,
      stages: [
        {
          id: "inspect",
          kind: "agent",
          context: "fresh",
          prompt: "Inspect the repository",
          produces: { id: "result", schema: "freeform" },
          terminal: true,
        },
      ],
    },
  };
}

function proposalRecord(
  mode: "create" | "update" = "create",
  status: WorkflowProposalStatus = "pending",
  targetWorkflowId?: string
): WorkflowProposalRecord {
  const meta: WorkflowProposalMeta = {
    version: 1,
    proposalId: "proposal-1",
    ...owner,
    mode,
    ...(targetWorkflowId ? { targetWorkflowId } : {}),
    suggestedPersist: "session",
    status,
    ...(status === "confirmed"
      ? {
          resolvedWorkflowId: targetWorkflowId ?? "workflow-created",
          resolvedPersist: "workspace" as const,
        }
      : {}),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  return { meta, yaml };
}

function createHarness(initial = proposalRecord()) {
  const records = new Map<string, WorkflowProposalRecord>([[initial.meta.proposalId, initial]]);
  const decisions = new Map<string, WorkflowDecisionRecord>();
  const savedSessionDefinitions: string[] = [];
  const savedWorkspaceDefinitions: string[] = [];
  const sessionDefinitions = new Map<string, WorkflowDefinitionRecord>();
  const workspaceDefinitions = new Map<string, WorkflowDefinitionRecord>();
  const saveProposal = vi.fn(async (input: SaveWorkflowProposalInput) => {
    const record: WorkflowProposalRecord = {
      meta: {
        version: 1,
        proposalId: input.proposalId,
        workspaceId: input.workspaceId,
        parentSessionId: input.parentSessionId,
        mode: input.mode,
        ...(input.targetWorkflowId ? { targetWorkflowId: input.targetWorkflowId } : {}),
        suggestedPersist: input.suggestedPersist,
        status: input.status ?? "pending",
        ...(input.handoffDelivered === undefined
          ? {}
          : { handoffDelivered: input.handoffDelivered }),
        createdAt: input.createdAt ?? timestamp,
        updatedAt: input.updatedAt ?? timestamp,
      },
      yaml: input.yaml,
    };
    records.set(record.meta.proposalId, record);
    return record;
  });
  const loadProposal = vi.fn(
    async (_workspaceId: string, _sessionId: string, proposalId: string) =>
      records.get(proposalId) ?? null
  );
  const listProposals = vi.fn(async () => [...records.values()]);
  const updateProposalStatus = vi.fn(
    async (
      _workspaceId: string,
      _sessionId: string,
      proposalId: string,
      status: WorkflowProposalStatus,
      patch: Partial<
        Pick<WorkflowProposalMeta, "handoffDelivered" | "resolvedWorkflowId" | "resolvedPersist">
      > = {}
    ): Promise<WorkflowProposalRecord | null> => {
      const current = records.get(proposalId);
      if (!current) return null;
      const next: WorkflowProposalRecord = {
        ...current,
        meta: { ...current.meta, status, ...patch, updatedAt: timestamp },
      };
      records.set(proposalId, next);
      return next;
    }
  );
  const loadSessionDefinition = vi.fn(
    async (_workspaceId: string, _sessionId: string, workflowId: string) =>
      sessionDefinitions.get(workflowId) ?? null
  );
  const loadWorkspaceDefinition = vi.fn(
    async (_workspaceId: string, workflowId: string) => workspaceDefinitions.get(workflowId) ?? null
  );
  const saveSessionDefinition = vi.fn(
    async (_workspaceId: string, _sessionId: string, workflowId: string) => {
      savedSessionDefinitions.push(workflowId);
      const record = definitionRecord(workflowId);
      sessionDefinitions.set(workflowId, record);
      return record;
    }
  );
  const saveWorkspaceDefinition = vi.fn(async (_workspaceId: string, workflowId: string) => {
    savedWorkspaceDefinitions.push(workflowId);
    const record = definitionRecord(workflowId);
    workspaceDefinitions.set(workflowId, record);
    return record;
  });
  const loadDecision = vi.fn(
    async (_workspaceId: string, _sessionId: string, proposalId: string) =>
      decisions.get(proposalId) ?? null
  );
  const saveDecision = vi.fn(async (record: WorkflowDecisionRecord) => {
    decisions.set(record.proposalId, record);
    return record;
  });
  const deps: Partial<WorkflowProposalServiceDependencies> = {
    saveProposal,
    loadProposal,
    listProposals,
    updateProposalStatus,
    loadSessionDefinition,
    loadWorkspaceDefinition,
    saveSessionDefinition,
    saveWorkspaceDefinition,
    loadDecision,
    saveDecision,
    createProposalId: vi.fn(() => "proposal-new"),
    createWorkflowId: vi.fn(() => "workflow-created"),
    createDecisionNotificationId: vi.fn(() => "notification-1"),
    now: () => timestamp,
  };
  return {
    service: new WorkflowProposalService(deps),
    records,
    decisions,
    savedSessionDefinitions,
    savedWorkspaceDefinitions,
    sessionDefinitions,
    workspaceDefinitions,
    spies: { saveProposal, loadProposal, updateProposalStatus, saveDecision },
  };
}

function confirmRequest(persist: "session" | "workspace"): WorkflowProposalConfirmRequest {
  return { ...owner, proposalId: "proposal-1", persist };
}

describe("WorkflowProposalService", () => {
  it.each([
    ["create", "session", undefined, "workflow-created"],
    ["create", "workspace", undefined, "workflow-created"],
    ["update", "session", "workflow-existing", "workflow-existing"],
    ["update", "workspace", "workflow-existing", "workflow-existing"],
  ] as const)(
    "confirms the %s/%s persistence branch",
    async (mode, persist, target, expectedId) => {
      const harness = createHarness(proposalRecord(mode, "pending", target));
      if (target) harness.workspaceDefinitions.set(target, definitionRecord(target));
      const result = await harness.service.confirmProposal(confirmRequest(persist));
      expect(result).toEqual({ status: "confirmed", workflowId: expectedId, persist });
      if (persist === "session") expect(harness.savedSessionDefinitions).toEqual([expectedId]);
      else expect(harness.savedWorkspaceDefinitions).toEqual([expectedId]);
    }
  );

  it("does not promote a session-only update target to workspace", async () => {
    const harness = createHarness(proposalRecord("update", "pending", "shadow-only"));
    harness.sessionDefinitions.set("shadow-only", definitionRecord("shadow-only"));
    await expect(
      harness.service.confirmProposal(confirmRequest("workspace"))
    ).rejects.toMatchObject({
      code: "WORKFLOW_PROPOSAL_TARGET_NOT_UPGRADABLE",
    });
    expect(harness.savedWorkspaceDefinitions).toEqual([]);
    expect(harness.records.get("proposal-1")?.meta.status).toBe("pending");
  });

  it("keeps confirm successful when the one-shot handoff is busy", async () => {
    const harness = createHarness();
    const handoff = vi.fn(async () => false);
    harness.service.setConfirmHandoffHandler(handoff);
    await expect(harness.service.confirmProposal(confirmRequest("workspace"))).resolves.toEqual({
      status: "confirmed",
      workflowId: "workflow-created",
      persist: "workspace",
    });
    expect(handoff).toHaveBeenCalledTimes(1);
    expect(harness.records.get("proposal-1")?.meta.handoffDelivered).toBe(false);
  });

  it("does not repeat definition writes, decision records, or handoff for terminal clicks", async () => {
    const harness = createHarness();
    const handoff = vi.fn(async () => true);
    harness.service.setConfirmHandoffHandler(handoff);
    await harness.service.confirmProposal(confirmRequest("workspace"));
    await harness.service.confirmProposal(confirmRequest("session"));
    expect(harness.spies.saveProposal).not.toHaveBeenCalled();
    expect(handoff).toHaveBeenCalledTimes(1);

    const cancelHarness = createHarness();
    await cancelHarness.service.cancelProposal({ ...owner, proposalId: "proposal-1" });
    await cancelHarness.service.cancelProposal({ ...owner, proposalId: "proposal-1" });
    expect(cancelHarness.spies.saveDecision).toHaveBeenCalledTimes(1);
    expect(cancelHarness.decisions.get("proposal-1")).toBeDefined();
  });
});
