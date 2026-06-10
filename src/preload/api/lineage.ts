import { ipcRenderer } from "electron";
import { LineageChannels } from "@shared/types/channels";
import type { IpcResponse } from "@shared/types/ipc";
import type {
  CreateSessionTaskInput,
  LineageTaskRef,
  LineageTaskSnapshot,
  Subject,
  TaskDownstreamProjection,
} from "@shared/types/lineage";
import type { TaskItem } from "@shared/types/task";

export const lineageApi = {
  ensureTaskSubject(
    projectId: string,
    snapshot: LineageTaskSnapshot
  ): Promise<IpcResponse<Subject>> {
    return ipcRenderer.invoke(LineageChannels.ensureTaskSubject, { projectId, snapshot });
  },

  linkTaskSession(
    projectId: string,
    taskRef: LineageTaskRef,
    sessionId: string
  ): Promise<IpcResponse<Subject | null>> {
    return ipcRenderer.invoke(LineageChannels.linkTaskSession, { projectId, taskRef, sessionId });
  },

  getByTask(
    projectId: string,
    ref: LineageTaskRef
  ): Promise<IpcResponse<TaskDownstreamProjection | null>> {
    return ipcRenderer.invoke(LineageChannels.getByTask, { projectId, ref });
  },

  createSessionTask(
    projectId: string,
    input: CreateSessionTaskInput
  ): Promise<IpcResponse<TaskItem>> {
    return ipcRenderer.invoke(LineageChannels.createSessionTask, { projectId, ...input });
  },
};
