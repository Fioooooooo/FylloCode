import { join } from "path";
import { getDataSubPath } from "@main/infra/paths";

export function assertStorageIdentity(id: string, label: "Workspace" | "Folder"): string {
  if (!id || id === "." || id === ".." || /[\\/\0]/.test(id)) {
    throw new Error(`${label} ID is not safe for storage`);
  }
  return id;
}

export function workspaceDataDir(workspaceId: string): string {
  return join(getDataSubPath("workspaces"), assertStorageIdentity(workspaceId, "Workspace"));
}

export function folderDataDir(folderId: string): string {
  return join(getDataSubPath("workspace-folders"), assertStorageIdentity(folderId, "Folder"));
}

export function sessionsDir(workspaceId: string): string {
  return join(workspaceDataDir(workspaceId), "sessions");
}

export function sessionDir(workspaceId: string, sessionId: string): string {
  return join(sessionsDir(workspaceId), assertStorageIdentity(sessionId, "Workspace"));
}

export function sessionPlansDir(workspaceId: string, sessionId: string): string {
  return join(sessionDir(workspaceId, sessionId), "plans");
}

export function tasksDir(workspaceId: string): string {
  return join(workspaceDataDir(workspaceId), "tasks");
}

export function tasksPath(workspaceId: string): string {
  return join(tasksDir(workspaceId), "tasks.json");
}

export function mcpEventsDir(workspaceId: string): string {
  return join(workspaceDataDir(workspaceId), "mcp-events");
}

export function knowledgeDir(workspaceId: string): string {
  return join(workspaceDataDir(workspaceId), "knowledge");
}

export function lineageDir(workspaceId: string): string {
  return join(workspaceDataDir(workspaceId), "lineage");
}

export function lineageSubjectsDir(workspaceId: string): string {
  return join(lineageDir(workspaceId), "subjects");
}

export function applyRunsDir(workspaceId: string): string {
  return join(workspaceDataDir(workspaceId), "apply-runs");
}

export function workflowsDir(workspaceId: string): string {
  return join(workspaceDataDir(workspaceId), "workflows");
}

export function integrationDir(workspaceId: string): string {
  return join(workspaceDataDir(workspaceId), "integration");
}
