import { ipcRenderer } from "electron";
import type { IpcResponse } from "@shared/types/ipc";
import { SpawnedSessionChannels } from "@shared/ipc/session/spawned-session.channels";
import type {
  SpawnedSessionDetailInput,
  SpawnedSessionDetailResult,
  SpawnedSessionListInput,
  SpawnedSessionSummary,
  SpawnedSessionWakePayload,
} from "@shared/ipc/session/spawned-session.schemas";

export const spawnedSessionApi = {
  list(input: SpawnedSessionListInput): Promise<IpcResponse<SpawnedSessionSummary[]>> {
    return ipcRenderer.invoke(SpawnedSessionChannels.list, input);
  },

  getDetail(input: SpawnedSessionDetailInput): Promise<IpcResponse<SpawnedSessionDetailResult>> {
    return ipcRenderer.invoke(SpawnedSessionChannels.getDetail, input);
  },

  onWake(handler: (payload: SpawnedSessionWakePayload) => void): () => void {
    const listener = (
      _event: Electron.IpcRendererEvent,
      payload: SpawnedSessionWakePayload
    ): void => handler(payload);
    ipcRenderer.on(SpawnedSessionChannels.wake, listener);
    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      ipcRenderer.off(SpawnedSessionChannels.wake, listener);
    };
  },
};
