import type { TaskItem } from "@shared/types/task";

export interface ProviderCapabilities {
  readonly providerId: string;
  readonly writableFields: readonly string[];
  readonly supportsComment: boolean;
}

export interface TaskAdapter {
  list(workspaceId: string): Promise<TaskItem[]>;
  get(taskId: string, workspaceId: string): Promise<TaskItem | null>;
  capabilities(): ProviderCapabilities;
  writeField?(workspaceId: string, taskRef: string, field: string, value: string): Promise<void>;
  writeComment?(workspaceId: string, taskRef: string, body: string): Promise<void>;
}
