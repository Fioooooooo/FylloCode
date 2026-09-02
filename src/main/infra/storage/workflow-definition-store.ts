import { promises as fs } from "node:fs";
import { writeFileAtomicSync } from "@main/infra/storage/atomic-write";
import {
  workflowDefinitionPath,
  workflowDir,
  workflowsDir,
} from "@main/infra/storage/workspace-paths";

export interface StoredWorkflowDefinition {
  workflowId: string;
  yaml: string;
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

export async function loadWorkflowDefinition(
  workspaceId: string,
  workflowId: string
): Promise<StoredWorkflowDefinition | null> {
  try {
    return {
      workflowId,
      yaml: await fs.readFile(workflowDefinitionPath(workspaceId, workflowId), "utf8"),
    };
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function listWorkflowDefinitions(
  workspaceId: string
): Promise<StoredWorkflowDefinition[]> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(workflowsDir(workspaceId), { withFileTypes: true });
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  const definitions = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => loadWorkflowDefinition(workspaceId, entry.name))
  );
  return definitions
    .filter((definition): definition is StoredWorkflowDefinition => definition !== null)
    .sort((left, right) => left.workflowId.localeCompare(right.workflowId));
}

export async function saveWorkflowDefinition(
  workspaceId: string,
  workflowId: string,
  yaml: string
): Promise<StoredWorkflowDefinition> {
  const path = workflowDefinitionPath(workspaceId, workflowId);
  await withWriteQueue(path, async () => {
    writeFileAtomicSync(path, yaml);
  });
  return { workflowId, yaml };
}

export async function deleteWorkflowDefinition(
  workspaceId: string,
  workflowId: string
): Promise<void> {
  await withWriteQueue(workflowDefinitionPath(workspaceId, workflowId), async () => {
    await fs.rm(workflowDefinitionPath(workspaceId, workflowId), { force: true });
  });
}

/** 只用于测试和诊断确认 v2 definition 的根路径，不暴露 legacy global staging。 */
export function workflowDefinitionRoot(workspaceId: string, workflowId: string): string {
  return workflowDir(workspaceId, workflowId);
}
