import { ipcMain } from "electron";
import type { WorkspaceWindowManager } from "@main/bootstrap/workspace-window-manager";
import { assertSessionBelongsToWorkspace } from "@main/services/session/chat/chat-service";
import {
  spawnedSessionManager,
  type SpawnedSessionManager,
} from "@main/services/session/spawn/spawned-session-manager";
import { spawnedSessionQueryService } from "@main/services/session/spawn/spawned-session-query-service";
import { SpawnedSessionChannels } from "@shared/ipc/session/spawned-session.channels";
import {
  spawnedSessionDetailInputSchema,
  spawnedSessionListInputSchema,
} from "@shared/ipc/session/spawned-session.schemas";
import { validate } from "../_kit/schema";
import { wrapHandler } from "../_kit/wrap-handler";
import { requireWorkspaceSender } from "../_kit/workspace-scope";

async function parentExists(workspaceId: string, parentSessionId: string): Promise<boolean> {
  try {
    await assertSessionBelongsToWorkspace(workspaceId, parentSessionId);
    return true;
  } catch {
    return false;
  }
}

export function setupSpawnedSessionViewBroadcast(
  manager: WorkspaceWindowManager,
  sessions: SpawnedSessionManager = spawnedSessionManager
): void {
  sessions.setViewWakeHandler((payload) => {
    manager.sendToWorkspace(payload.workspaceId, SpawnedSessionChannels.wake, payload);
  });
}

export function registerSpawnedSessionHandlers(): void {
  ipcMain.handle(SpawnedSessionChannels.list, (event, input: unknown) =>
    wrapHandler(async () => {
      const owner = validate(spawnedSessionListInputSchema, input);
      requireWorkspaceSender(event.sender, owner.workspaceId);
      if (!(await parentExists(owner.workspaceId, owner.parentSessionId))) return [];
      return spawnedSessionQueryService.listSpawnedSessions(owner);
    })
  );

  ipcMain.handle(SpawnedSessionChannels.getDetail, (event, input: unknown) =>
    wrapHandler(async () => {
      const owner = validate(spawnedSessionDetailInputSchema, input);
      requireWorkspaceSender(event.sender, owner.workspaceId);
      if (!(await parentExists(owner.workspaceId, owner.parentSessionId))) {
        return { status: "not_found" as const };
      }
      return spawnedSessionQueryService.getSpawnedSessionDetail(owner);
    })
  );
}
