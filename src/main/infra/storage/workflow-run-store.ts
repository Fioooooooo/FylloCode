import { promises as fs } from "node:fs";
import type { Dirent } from "node:fs";
import { dirname } from "node:path";
import { writeFileAtomicSync } from "@main/infra/storage/atomic-write";
import {
  workflowRunActionOutputPath,
  workflowRunSessionTranscriptPath,
  workflowRunSnapshotPath,
  workflowRunsDir,
  workflowsDir,
} from "@main/infra/storage/workspace-paths";
import type { WorkflowRunSnapshot } from "@shared/types/workflow";

export interface WorkflowRunOwner {
  workspaceId: string;
  workflowId: string;
  runId: string;
  parentSessionId: string;
}

export interface WorkflowRunSnapshotEntry {
  owner: Omit<WorkflowRunOwner, "parentSessionId"> & { parentSessionId?: string };
  snapshot: WorkflowRunSnapshot | null;
  error?: unknown;
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

function assertSnapshotOwner(owner: WorkflowRunOwner, snapshot: WorkflowRunSnapshot): void {
  if (
    snapshot.runId !== owner.runId ||
    snapshot.workflowId !== owner.workflowId ||
    snapshot.parentSessionId !== owner.parentSessionId
  ) {
    throw Object.assign(new Error("Workflow Run snapshot owner does not match its path"), {
      code: "WORKFLOW_SNAPSHOT_OWNER_MISMATCH",
    });
  }
}

function parseSnapshot(content: string): WorkflowRunSnapshot {
  const parsed: unknown = JSON.parse(content);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Workflow Run snapshot must be a JSON object");
  }
  return parsed as WorkflowRunSnapshot;
}

export async function saveWorkflowRunSnapshot(
  owner: WorkflowRunOwner,
  snapshot: WorkflowRunSnapshot
): Promise<void> {
  assertSnapshotOwner(owner, snapshot);
  const path = workflowRunSnapshotPath(owner.workspaceId, owner.workflowId, owner.runId);
  await withWriteQueue(path, async () => {
    writeFileAtomicSync(path, `${JSON.stringify(snapshot, null, 2)}\n`);
  });
}

export async function loadWorkflowRunSnapshot(
  owner: WorkflowRunOwner
): Promise<WorkflowRunSnapshot | null> {
  try {
    const snapshot = parseSnapshot(
      await fs.readFile(
        workflowRunSnapshotPath(owner.workspaceId, owner.workflowId, owner.runId),
        "utf8"
      )
    );
    assertSnapshotOwner(owner, snapshot);
    return snapshot;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function listDirectories(path: string): Promise<Dirent[]> {
  try {
    return await fs.readdir(path, { withFileTypes: true });
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function listRunEntriesForWorkflow(
  workspaceId: string,
  workflowId: string
): Promise<WorkflowRunSnapshotEntry[]> {
  const runEntries = await listDirectories(workflowRunsDir(workspaceId, workflowId));
  const entries = await Promise.all(
    runEntries
      .filter((entry) => entry.isDirectory())
      .map(async (entry): Promise<WorkflowRunSnapshotEntry> => {
        const runId = entry.name;
        const owner = { workspaceId, workflowId, runId };
        try {
          const snapshot = parseSnapshot(
            await fs.readFile(workflowRunSnapshotPath(workspaceId, workflowId, runId), "utf8")
          );
          if (snapshot.runId !== runId || snapshot.workflowId !== workflowId) {
            throw Object.assign(new Error("Workflow Run snapshot owner does not match its path"), {
              code: "WORKFLOW_SNAPSHOT_OWNER_MISMATCH",
            });
          }
          return { owner: { ...owner, parentSessionId: snapshot.parentSessionId }, snapshot };
        } catch (error: unknown) {
          return { owner, snapshot: null, error };
        }
      })
  );
  return entries.sort((left, right) => left.owner.runId.localeCompare(right.owner.runId));
}

export async function listWorkflowRunSnapshotEntries(
  workspaceId: string,
  workflowId?: string
): Promise<WorkflowRunSnapshotEntry[]> {
  const workflowEntries = workflowId
    ? [{ name: workflowId, isDirectory: () => true } as Dirent]
    : await listDirectories(workflowsDir(workspaceId));
  const entries = await Promise.all(
    workflowEntries
      .filter((entry) => entry.isDirectory())
      .map((entry) => listRunEntriesForWorkflow(workspaceId, entry.name))
  );
  return entries.flat();
}

export async function listWorkflowRunSnapshots(
  workspaceId: string,
  parentSessionId: string,
  workflowId?: string
): Promise<Array<{ owner: WorkflowRunOwner; snapshot: WorkflowRunSnapshot }>> {
  const entries = await listWorkflowRunSnapshotEntries(workspaceId, workflowId);
  return entries.flatMap((entry) => {
    if (!entry.snapshot || entry.snapshot.parentSessionId !== parentSessionId) return [];
    return [
      {
        owner: {
          ...entry.owner,
          parentSessionId,
        } as WorkflowRunOwner,
        snapshot: entry.snapshot,
      },
    ];
  });
}

export async function appendWorkflowRunTranscript(
  owner: WorkflowRunOwner,
  sessionId: string,
  line: string | unknown
): Promise<void> {
  const path = workflowRunSessionTranscriptPath(
    owner.workspaceId,
    owner.workflowId,
    owner.runId,
    sessionId
  );
  await withWriteQueue(path, async () => {
    await fs.mkdir(dirname(path), { recursive: true });
    await fs.appendFile(
      path,
      `${typeof line === "string" ? line : JSON.stringify(line)}\n`,
      "utf8"
    );
  });
}

export async function readWorkflowRunTranscript(
  owner: WorkflowRunOwner,
  sessionId: string
): Promise<string> {
  try {
    return await fs.readFile(
      workflowRunSessionTranscriptPath(owner.workspaceId, owner.workflowId, owner.runId, sessionId),
      "utf8"
    );
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw error;
  }
}

export async function appendWorkflowActionLog(
  owner: WorkflowRunOwner,
  stageId: string,
  chunk: string | Uint8Array
): Promise<void> {
  const path = workflowRunActionOutputPath(
    owner.workspaceId,
    owner.workflowId,
    owner.runId,
    stageId
  );
  await withWriteQueue(path, async () => {
    await fs.mkdir(dirname(path), { recursive: true });
    await fs.appendFile(path, chunk);
  });
}

export async function readWorkflowActionLog(
  owner: WorkflowRunOwner,
  stageId: string
): Promise<string> {
  try {
    return await fs.readFile(
      workflowRunActionOutputPath(owner.workspaceId, owner.workflowId, owner.runId, stageId),
      "utf8"
    );
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw error;
  }
}
