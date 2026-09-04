import { promises as fs } from "node:fs";
import { z } from "zod";
import { writeFileAtomicSync } from "@main/infra/storage/atomic-write";
import {
  workflowProposalDefinitionPath,
  workflowProposalMetaPath,
  workflowProposalsDir,
} from "@main/infra/storage/workspace-paths";
import type {
  WorkflowProposalMode,
  WorkflowProposalPersist,
  WorkflowProposalStatus,
} from "@shared/types/workflow";

const workflowProposalMetaSchema = z
  .object({
    version: z.literal(1),
    proposalId: z.string().min(1),
    workspaceId: z.string().min(1),
    parentSessionId: z.string().min(1),
    mode: z.enum(["create", "update"]),
    targetWorkflowId: z.string().min(1).optional(),
    suggestedPersist: z.enum(["session", "workspace"]),
    status: z.enum(["pending", "confirming", "confirmed", "cancelled"]),
    handoffDelivered: z.boolean().optional(),
    resolvedWorkflowId: z.string().min(1).optional(),
    resolvedPersist: z.enum(["session", "workspace"]).optional(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export type WorkflowProposalMeta = z.infer<typeof workflowProposalMetaSchema>;

export interface WorkflowProposalRecord {
  meta: WorkflowProposalMeta;
  yaml: string;
}

export interface WorkflowProposalOwner {
  workspaceId: string;
  parentSessionId: string;
}

export interface SaveWorkflowProposalInput extends WorkflowProposalOwner {
  proposalId: string;
  yaml: string;
  mode: WorkflowProposalMode;
  targetWorkflowId?: string;
  suggestedPersist: WorkflowProposalPersist;
  status?: WorkflowProposalStatus;
  handoffDelivered?: boolean;
  resolvedWorkflowId?: string;
  resolvedPersist?: WorkflowProposalPersist;
  createdAt?: string;
  updatedAt?: string;
}

const writeQueues = new Map<string, Promise<void>>();

async function withWriteQueue<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = writeQueues.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queued = previous.catch(() => undefined).then(() => current);
  writeQueues.set(key, queued);
  await previous.catch(() => undefined);
  try {
    return await task();
  } finally {
    release();
    if (writeQueues.get(key) === queued) writeQueues.delete(key);
  }
}

function proposalKey(owner: WorkflowProposalOwner, proposalId: string): string {
  return `${owner.workspaceId}\0${owner.parentSessionId}\0${proposalId}`;
}

function parseMeta(input: unknown): WorkflowProposalMeta {
  return workflowProposalMetaSchema.parse(input);
}

function assertMetaOwner(meta: WorkflowProposalMeta, owner: WorkflowProposalOwner): void {
  if (meta.workspaceId !== owner.workspaceId || meta.parentSessionId !== owner.parentSessionId) {
    throw Object.assign(new Error("Workflow proposal owner does not match its storage path"), {
      code: "WORKFLOW_PROPOSAL_OWNER_MISMATCH",
    });
  }
}

function metaFromInput(input: SaveWorkflowProposalInput): WorkflowProposalMeta {
  const now = new Date().toISOString();
  return parseMeta({
    version: 1,
    proposalId: input.proposalId,
    workspaceId: input.workspaceId,
    parentSessionId: input.parentSessionId,
    mode: input.mode,
    ...(input.targetWorkflowId ? { targetWorkflowId: input.targetWorkflowId } : {}),
    suggestedPersist: input.suggestedPersist,
    status: input.status ?? "pending",
    ...(input.handoffDelivered !== undefined ? { handoffDelivered: input.handoffDelivered } : {}),
    ...(input.resolvedWorkflowId ? { resolvedWorkflowId: input.resolvedWorkflowId } : {}),
    ...(input.resolvedPersist ? { resolvedPersist: input.resolvedPersist } : {}),
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  });
}

export async function saveWorkflowProposal(
  input: SaveWorkflowProposalInput
): Promise<WorkflowProposalRecord> {
  const owner = { workspaceId: input.workspaceId, parentSessionId: input.parentSessionId };
  const meta = metaFromInput(input);
  await withWriteQueue(proposalKey(owner, input.proposalId), async () => {
    writeFileAtomicSync(
      workflowProposalDefinitionPath(owner.workspaceId, owner.parentSessionId, input.proposalId),
      input.yaml
    );
    writeFileAtomicSync(
      workflowProposalMetaPath(owner.workspaceId, owner.parentSessionId, input.proposalId),
      `${JSON.stringify(meta, null, 2)}\n`
    );
  });
  return { meta, yaml: input.yaml };
}

export async function loadWorkflowProposal(
  workspaceId: string,
  parentSessionId: string,
  proposalId: string
): Promise<WorkflowProposalRecord | null> {
  const owner = { workspaceId, parentSessionId };
  try {
    const [yaml, rawMeta] = await Promise.all([
      fs.readFile(workflowProposalDefinitionPath(workspaceId, parentSessionId, proposalId), "utf8"),
      fs.readFile(workflowProposalMetaPath(workspaceId, parentSessionId, proposalId), "utf8"),
    ]);
    const meta = parseMeta(JSON.parse(rawMeta) as unknown);
    assertMetaOwner(meta, owner);
    if (meta.proposalId !== proposalId) {
      throw Object.assign(new Error("Workflow proposal ID does not match its storage path"), {
        code: "WORKFLOW_PROPOSAL_OWNER_MISMATCH",
      });
    }
    return { meta, yaml };
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function listWorkflowProposals(
  workspaceId: string,
  parentSessionId: string
): Promise<WorkflowProposalRecord[]> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(workflowProposalsDir(workspaceId, parentSessionId), {
      withFileTypes: true,
    });
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  const records = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => loadWorkflowProposal(workspaceId, parentSessionId, entry.name))
  );
  return records
    .filter((record): record is WorkflowProposalRecord => record !== null)
    .sort((left, right) => {
      const byCreatedAt = left.meta.createdAt.localeCompare(right.meta.createdAt);
      return byCreatedAt || left.meta.proposalId.localeCompare(right.meta.proposalId);
    });
}

export async function updateWorkflowProposalStatus(
  workspaceId: string,
  parentSessionId: string,
  proposalId: string,
  status: WorkflowProposalStatus,
  patch: Partial<
    Pick<WorkflowProposalMeta, "handoffDelivered" | "resolvedWorkflowId" | "resolvedPersist">
  > = {}
): Promise<WorkflowProposalRecord | null> {
  const owner = { workspaceId, parentSessionId };
  return withWriteQueue(proposalKey(owner, proposalId), async () => {
    const current = await loadWorkflowProposal(workspaceId, parentSessionId, proposalId);
    if (!current) return null;
    const meta = parseMeta({
      ...current.meta,
      status,
      ...patch,
      updatedAt: new Date().toISOString(),
    });
    writeFileAtomicSync(
      workflowProposalMetaPath(workspaceId, parentSessionId, proposalId),
      `${JSON.stringify(meta, null, 2)}\n`
    );
    return { ...current, meta };
  });
}

export function resetWorkflowProposalStoreForTests(): void {
  writeQueues.clear();
}
