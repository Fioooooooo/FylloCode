import type { IpcResponse } from "@shared/types/ipc";
import type {
  CreateSessionTaskInput,
  LineageTaskRef,
  LineageTaskSnapshot,
  PlanDocument,
  SessionLineageProjection,
  Subject,
  TaskDownstreamProjection,
} from "@shared/types/lineage";
import type { TaskItem } from "@shared/types/task";

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

  getBySession(
    projectId: string,
    sessionId: string
  ): Promise<IpcResponse<SessionLineageProjection | null>> {
    return window.api.lineage.getBySession(projectId, sessionId);
  },

  createSessionTask(
    projectId: string,
    input: CreateSessionTaskInput
  ): Promise<IpcResponse<TaskItem>> {
    return window.api.lineage.createSessionTask(projectId, input);
  },

  readPlan(
    projectId: string,
    input: { sessionId: string; slug: string }
  ): Promise<IpcResponse<PlanDocument>> {
    return window.api.lineage.readPlan(projectId, input);
  },

  savePlanBody(
    projectId: string,
    input: { sessionId: string; slug: string; body: string }
  ): Promise<IpcResponse<PlanDocument>> {
    return window.api.lineage.savePlanBody(projectId, input);
  },

  approvePlan(
    projectId: string,
    input: { sessionId: string; slug: string }
  ): Promise<IpcResponse<PlanDocument>> {
    return window.api.lineage.approvePlan(projectId, input);
  },
};
