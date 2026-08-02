import { listSessionMetas } from "@main/infra/storage/session-store";
import type {
  WorkspaceHistoricalSessionReference,
  WorkspaceRuntimeReference,
} from "@shared/types/workspace";
import { sessionProbeRegistry } from "./session-probe-registry";
import { sessionRegistry } from "./session-registry";

export async function inspectSessionWorkspaceFolderReferences(
  workspaceId: string,
  folderId: string
): Promise<{
  activeReferences: WorkspaceRuntimeReference[];
  historicalSessions: WorkspaceHistoricalSessionReference[];
}> {
  const metas = (await listSessionMetas(workspaceId)).filter((meta) =>
    meta.workspaceSnapshot?.folders.some((folder) => folder.folderId === folderId)
  );
  const activeEntries = sessionRegistry.listWorkspace(workspaceId);
  const activeSessionIds = new Set(
    activeEntries
      .filter((entry) => entry.owner === "chat")
      .map((entry) => entry.key.slice(`${workspaceId}:`.length))
  );
  const activeReferences = activeEntries.flatMap<WorkspaceRuntimeReference>((entry) => {
    const referenceId = entry.key.slice(`${workspaceId}:`.length);
    if (entry.owner === "chat") {
      const meta = metas.find((candidate) => candidate.sessionId === referenceId);
      if (!meta) return [];
      return [{ kind: "chat", workspaceId, folderId, sessionId: referenceId }];
    }
    return [{ kind: entry.owner, workspaceId, folderId, runId: referenceId }];
  });

  if (sessionProbeRegistry.hasWorkspace(workspaceId)) {
    activeReferences.push({ kind: "probe", workspaceId, folderId });
  }

  return {
    activeReferences,
    historicalSessions: metas
      .filter((meta) => !activeSessionIds.has(meta.sessionId))
      .map((meta) => ({
        workspaceId,
        folderId,
        sessionId: meta.sessionId,
        sessionName: meta.title,
      })),
  };
}
