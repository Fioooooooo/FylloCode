import { join } from "path";
import { getDataSubPath } from "@main/infra/paths";

export function assertStorageIdentity(
  id: string,
  label:
    | "Workspace"
    | "Folder"
    | "Session"
    | "Response"
    | "Turn"
    | "Workflow"
    | "Proposal"
    | "Notification"
    | "Run"
    | "Stage"
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

export function workflowsDir(workspaceId: string): string {
  return join(workspaceDataDir(workspaceId), "workflows");
}

export function workflowDir(workspaceId: string, workflowId: string): string {
  return join(workflowsDir(workspaceId), assertStorageIdentity(workflowId, "Workflow"));
}

export function workflowDefinitionPath(workspaceId: string, workflowId: string): string {
  return join(workflowDir(workspaceId, workflowId), "definition.yaml");
}

export function workflowProposalsDir(workspaceId: string, parentSessionId: string): string {
  return join(sessionDir(workspaceId, parentSessionId), "workflow-proposals");
}

export function workflowProposalDir(
  workspaceId: string,
  parentSessionId: string,
  proposalId: string
): string {
  return join(
    workflowProposalsDir(workspaceId, parentSessionId),
    assertStorageIdentity(proposalId, "Proposal")
  );
}

export function workflowProposalDefinitionPath(
  workspaceId: string,
  parentSessionId: string,
  proposalId: string
): string {
  return join(workflowProposalDir(workspaceId, parentSessionId, proposalId), "definition.yaml");
}

export function workflowProposalMetaPath(
  workspaceId: string,
  parentSessionId: string,
  proposalId: string
): string {
  return join(workflowProposalDir(workspaceId, parentSessionId, proposalId), ".meta.json");
}

export function workflowDecisionsDir(workspaceId: string, parentSessionId: string): string {
  return join(sessionDir(workspaceId, parentSessionId), "workflow-decisions");
}

export function workflowDecisionPath(
  workspaceId: string,
  parentSessionId: string,
  proposalId: string
): string {
  return join(
    workflowDecisionsDir(workspaceId, parentSessionId),
    `${assertStorageIdentity(proposalId, "Proposal")}.json`
  );
}

export function sessionWorkflowsDir(workspaceId: string, sessionId: string): string {
  return join(sessionDir(workspaceId, sessionId), "workflows");
}

export function sessionWorkflowDefinitionPath(
  workspaceId: string,
  sessionId: string,
  workflowId: string
): string {
  return join(
    sessionWorkflowsDir(workspaceId, sessionId),
    `${assertStorageIdentity(workflowId, "Workflow")}.yaml`
  );
}

export function workflowRunsDir(workspaceId: string, workflowId: string): string {
  return join(workflowDir(workspaceId, workflowId), "runs");
}

export function workflowRunDir(workspaceId: string, workflowId: string, runId: string): string {
  return join(workflowRunsDir(workspaceId, workflowId), assertStorageIdentity(runId, "Run"));
}

export function workflowRunSnapshotPath(
  workspaceId: string,
  workflowId: string,
  runId: string
): string {
  return join(
    workflowRunDir(workspaceId, workflowId, runId),
    `${assertStorageIdentity(runId, "Run")}.json`
  );
}

export function workflowRunSessionTranscriptPath(
  workspaceId: string,
  workflowId: string,
  runId: string,
  sessionId: string
): string {
  return join(
    workflowRunDir(workspaceId, workflowId, runId),
    "sessions",
    `${assertStorageIdentity(sessionId, "Session")}.jsonl`
  );
}

export function workflowRunActionOutputPath(
  workspaceId: string,
  workflowId: string,
  runId: string,
  stageId: string
): string {
  return join(
    workflowRunDir(workspaceId, workflowId, runId),
    "action-outputs",
    `${assertStorageIdentity(stageId, "Stage")}.log`
  );
}

export function integrationDir(workspaceId: string): string {
  return join(workspaceDataDir(workspaceId), "integration");
}
