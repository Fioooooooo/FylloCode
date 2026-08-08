import type { IpcResponse } from "@shared/types/ipc";
import type {
  SpawnedSessionDetailInput,
  SpawnedSessionDetailResult,
  SpawnedSessionListInput,
  SpawnedSessionSummary,
  SpawnedSessionWakePayload,
} from "@shared/ipc/session/spawned-session.schemas";

export const spawnedSessionApi = {
  list(input: SpawnedSessionListInput): Promise<IpcResponse<SpawnedSessionSummary[]>> {
    return window.api.session.spawnedSession.list(input);
  },

  getDetail(input: SpawnedSessionDetailInput): Promise<IpcResponse<SpawnedSessionDetailResult>> {
    return window.api.session.spawnedSession.getDetail(input);
  },

  onWake(handler: (payload: SpawnedSessionWakePayload) => void): () => void {
    return window.api.session.spawnedSession.onWake(handler);
  },
};
