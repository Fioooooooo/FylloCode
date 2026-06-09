import type { IpcResponse } from "@shared/types/ipc";
import type {
  LineageTaskRef,
  LineageTaskSnapshot,
  Subject,
  TaskDownstreamProjection,
} from "@shared/types/lineage";

export const lineageApi = {
  ensureTaskSubject(
    projectId: string,
    snapshot: LineageTaskSnapshot
  ): Promise<IpcResponse<Subject>> {
    return window.api.lineage.ensureTaskSubject(projectId, snapshot);
  },

  linkTaskSession(
    projectId: string,
    taskRef: LineageTaskRef,
    sessionId: string
  ): Promise<IpcResponse<Subject | null>> {
    return window.api.lineage.linkTaskSession(projectId, taskRef, sessionId);
  },

  getByTask(
    projectId: string,
    ref: LineageTaskRef
  ): Promise<IpcResponse<TaskDownstreamProjection | null>> {
    return window.api.lineage.getByTask(projectId, ref);
  },
};
