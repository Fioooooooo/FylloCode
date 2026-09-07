import { readFileSync } from "node:fs";
import { writeFileAtomicSync } from "@main/infra/storage/atomic-write";
import { workflowIdempotencyPath } from "@main/infra/storage/workspace-paths";

export interface WorkflowIdempotencyRecord {
  executedAt: string;
  runId: string;
  stageId: string;
}

export type WorkflowIdempotencyMap = Record<string, WorkflowIdempotencyRecord>;

export function loadWorkflowIdempotency(
  workspaceId: string,
  workflowId: string
): WorkflowIdempotencyMap {
  try {
    const value: unknown = JSON.parse(
      readFileSync(workflowIdempotencyPath(workspaceId, workflowId), "utf8")
    );
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {};
    }
    return value as WorkflowIdempotencyMap;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
}

export function recordWorkflowIdempotency(
  workspaceId: string,
  workflowId: string,
  key: string,
  record: WorkflowIdempotencyRecord
): void {
  const records = loadWorkflowIdempotency(workspaceId, workflowId);
  records[key] = record;
  writeFileAtomicSync(
    workflowIdempotencyPath(workspaceId, workflowId),
    `${JSON.stringify(records, null, 2)}\n`
  );
}
