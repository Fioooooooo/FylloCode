import { promises as fs } from "node:fs";
import { z } from "zod";
import { writeFileAtomicSync } from "@main/infra/storage/atomic-write";
import {
  sessionsDir,
  workflowDecisionPath,
  workflowDecisionsDir,
} from "@main/infra/storage/workspace-paths";

export const workflowDecisionNotificationStateSchema = z.enum([
  "pending",
  "dispatched",
  "delivered",
  "delivery_unknown",
  "suppressed",
]);

export type WorkflowDecisionNotificationState = z.infer<
  typeof workflowDecisionNotificationStateSchema
>;

const workflowDecisionRecordSchema = z
  .object({
    version: z.literal(1),
    workspaceId: z.string().min(1),
    parentSessionId: z.string().min(1),
    proposalId: z.string().min(1),
    decision: z.literal("cancelled"),
    notification: z
      .object({
        notificationId: z.string().min(1),
        state: workflowDecisionNotificationStateSchema,
        updatedAt: z.string().datetime(),
      })
      .strict(),
    decidedAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export type WorkflowDecisionRecord = z.infer<typeof workflowDecisionRecordSchema>;

export interface WorkflowDecisionOwner {
  workspaceId: string;
  parentSessionId: string;
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

function decisionKey(owner: WorkflowDecisionOwner, proposalId: string): string {
  return `${owner.workspaceId}\0${owner.parentSessionId}\0${proposalId}`;
}

function parseRecord(input: unknown): WorkflowDecisionRecord {
  return workflowDecisionRecordSchema.parse(input);
}

function assertRecordOwner(
  record: WorkflowDecisionRecord,
  owner: WorkflowDecisionOwner,
  proposalId: string
): void {
  if (
    record.workspaceId !== owner.workspaceId ||
    record.parentSessionId !== owner.parentSessionId ||
    record.proposalId !== proposalId
  ) {
    throw Object.assign(new Error("Workflow decision owner does not match its storage path"), {
      code: "WORKFLOW_DECISION_OWNER_MISMATCH",
    });
  }
}

export async function saveWorkflowDecision(
  record: WorkflowDecisionRecord
): Promise<WorkflowDecisionRecord> {
  const parsed = parseRecord(record);
  const owner = { workspaceId: parsed.workspaceId, parentSessionId: parsed.parentSessionId };
  await withWriteQueue(decisionKey(owner, parsed.proposalId), async () => {
    writeFileAtomicSync(
      workflowDecisionPath(owner.workspaceId, owner.parentSessionId, parsed.proposalId),
      `${JSON.stringify(parsed, null, 2)}\n`
    );
  });
  return parsed;
}

export async function loadWorkflowDecision(
  workspaceId: string,
  parentSessionId: string,
  proposalId: string
): Promise<WorkflowDecisionRecord | null> {
  const owner = { workspaceId, parentSessionId };
  try {
    const record = parseRecord(
      JSON.parse(
        await fs.readFile(workflowDecisionPath(workspaceId, parentSessionId, proposalId), "utf8")
      ) as unknown
    );
    assertRecordOwner(record, owner, proposalId);
    return record;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function listWorkflowDecisionsInParent(
  workspaceId: string,
  parentSessionId: string
): Promise<WorkflowDecisionRecord[]> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(workflowDecisionsDir(workspaceId, parentSessionId), {
      withFileTypes: true,
    });
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  const records = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) =>
        loadWorkflowDecision(workspaceId, parentSessionId, entry.name.slice(0, -".json".length))
      )
  );
  return records.filter((record): record is WorkflowDecisionRecord => record !== null);
}

export async function listWorkflowDecisions(
  workspaceId: string
): Promise<WorkflowDecisionRecord[]> {
  let sessionEntries: import("node:fs").Dirent[];
  try {
    sessionEntries = await fs.readdir(sessionsDir(workspaceId), { withFileTypes: true });
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  const records = await Promise.all(
    sessionEntries
      .filter((entry) => entry.isDirectory())
      .map((entry) => listWorkflowDecisionsInParent(workspaceId, entry.name))
  );
  return records.flat().sort((left, right) => {
    const byUpdatedAt = left.updatedAt.localeCompare(right.updatedAt);
    return byUpdatedAt || left.proposalId.localeCompare(right.proposalId);
  });
}

export async function listPendingWorkflowDecisions(
  workspaceId: string
): Promise<WorkflowDecisionRecord[]> {
  const records = await listWorkflowDecisions(workspaceId);
  return records.filter((record) => record.notification.state === "pending");
}

export async function claimWorkflowDecision(
  workspaceId: string,
  notificationId: string,
  updatedAt: string
): Promise<WorkflowDecisionRecord | null> {
  const candidate = (await listPendingWorkflowDecisions(workspaceId)).find(
    (record) => record.notification.notificationId === notificationId
  );
  if (!candidate) return null;
  const owner = { workspaceId: candidate.workspaceId, parentSessionId: candidate.parentSessionId };
  return withWriteQueue(decisionKey(owner, candidate.proposalId), async () => {
    const current = await loadWorkflowDecision(
      owner.workspaceId,
      owner.parentSessionId,
      candidate.proposalId
    );
    if (
      !current ||
      current.notification.notificationId !== notificationId ||
      current.notification.state !== "pending"
    ) {
      return null;
    }
    const next = parseRecord({
      ...current,
      notification: { notificationId, state: "dispatched", updatedAt },
      updatedAt,
    });
    writeFileAtomicSync(
      workflowDecisionPath(owner.workspaceId, owner.parentSessionId, candidate.proposalId),
      `${JSON.stringify(next, null, 2)}\n`
    );
    return next;
  });
}

export async function setWorkflowDecisionNotificationState(
  owner: WorkflowDecisionOwner,
  proposalId: string,
  notificationId: string,
  state: Exclude<WorkflowDecisionNotificationState, "pending" | "dispatched">,
  updatedAt: string
): Promise<WorkflowDecisionRecord | null> {
  return withWriteQueue(decisionKey(owner, proposalId), async () => {
    const current = await loadWorkflowDecision(
      owner.workspaceId,
      owner.parentSessionId,
      proposalId
    );
    if (!current) return null;
    if (current.notification.notificationId !== notificationId) {
      throw Object.assign(new Error("Workflow decision notification identity does not match"), {
        code: "WORKFLOW_DECISION_INVALID_REQUEST",
      });
    }
    if (current.notification.state === "suppressed" && state !== "suppressed") return current;
    if (
      (current.notification.state === "delivered" ||
        current.notification.state === "delivery_unknown") &&
      state !== "suppressed"
    ) {
      return current;
    }
    const next = parseRecord({
      ...current,
      notification: { notificationId, state, updatedAt },
      updatedAt,
    });
    writeFileAtomicSync(
      workflowDecisionPath(owner.workspaceId, owner.parentSessionId, proposalId),
      `${JSON.stringify(next, null, 2)}\n`
    );
    return next;
  });
}

export function resetWorkflowDecisionStoreForTests(): void {
  writeQueues.clear();
}
