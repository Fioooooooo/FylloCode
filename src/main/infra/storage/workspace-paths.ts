import { join } from "path";
import { getDataSubPath } from "@main/infra/paths";

export function assertStorageIdentity(
  id: string,
  label: "Workspace" | "Folder" | "Session" | "Response" | "Turn"
): string {
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

export function folderLineageDir(folderId: string): string {
  return join(folderDataDir(folderId), "lineage");
}

export function repositoryLineageIndexPath(folderId: string): string {
  return join(folderLineageDir(folderId), "index.json");
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

export function spawnedSessionsDir(workspaceId: string, parentSessionId: string): string {
  return join(sessionDir(workspaceId, assertStorageIdentity(parentSessionId, "Session")), "spawn");
}

export function spawnedSessionDir(
  workspaceId: string,
  parentSessionId: string,
  spawnedSessionId: string
): string {
  return join(
    spawnedSessionsDir(workspaceId, parentSessionId),
    assertStorageIdentity(spawnedSessionId, "Session")
  );
}

export function spawnedSessionMetaPath(
  workspaceId: string,
  parentSessionId: string,
  spawnedSessionId: string
): string {
  return join(spawnedSessionDir(workspaceId, parentSessionId, spawnedSessionId), "meta.json");
}

export function spawnedSessionMessagesPath(
  workspaceId: string,
  parentSessionId: string,
  spawnedSessionId: string
): string {
  return join(spawnedSessionDir(workspaceId, parentSessionId, spawnedSessionId), "messages.jsonl");
}

export function spawnedSessionResponsesDir(
  workspaceId: string,
  parentSessionId: string,
  spawnedSessionId: string
): string {
  return join(spawnedSessionDir(workspaceId, parentSessionId, spawnedSessionId), "responses");
}

export function spawnedSessionResponsePath(
  workspaceId: string,
  parentSessionId: string,
  spawnedSessionId: string,
  responseId: string
): string {
  return join(
    spawnedSessionResponsesDir(workspaceId, parentSessionId, spawnedSessionId),
    `${assertStorageIdentity(responseId, "Response")}.md`
  );
}

export function spawnedSessionTurnsDir(
  workspaceId: string,
  parentSessionId: string,
  spawnedSessionId: string
): string {
  return join(spawnedSessionDir(workspaceId, parentSessionId, spawnedSessionId), "turns");
}

export function spawnedSessionTurnPath(
  workspaceId: string,
  parentSessionId: string,
  spawnedSessionId: string,
  turnId: string
): string {
  return join(
    spawnedSessionTurnsDir(workspaceId, parentSessionId, spawnedSessionId),
    `${assertStorageIdentity(turnId, "Turn")}.json`
  );
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
