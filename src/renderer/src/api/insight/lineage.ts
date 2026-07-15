import type { IpcResponse } from "@shared/types/ipc";
import type {
  CreateSessionTaskInput,
  LineageBrowserData,
  LineageTaskRef,
  LineageTaskSnapshot,
  PlanDocument,
  SessionLineageProjection,
  Subject,
  TaskDownstreamProjection,
} from "@shared/types/lineage";
import type { TaskItem } from "@shared/types/task";

export const lineageApi = {
  getBrowser(projectId: string): Promise<IpcResponse<LineageBrowserData>> {
    return window.api.insight.lineage.getBrowser(projectId);
  },

  ensureTaskSubject(
    projectId: string,
    snapshot: LineageTaskSnapshot
  ): Promise<IpcResponse<Subject>> {
    return window.api.insight.lineage.ensureTaskSubject(projectId, snapshot);
  },

  linkTaskSession(
    projectId: string,
    taskRef: LineageTaskRef,
    sessionId: string
  ): Promise<IpcResponse<Subject | null>> {
    return window.api.insight.lineage.linkTaskSession(projectId, taskRef, sessionId);
  },

  getByTask(
    projectId: string,
    ref: LineageTaskRef
  ): Promise<IpcResponse<TaskDownstreamProjection | null>> {
    return window.api.insight.lineage.getByTask(projectId, ref);
  },

  getBySession(
    projectId: string,
    sessionId: string
  ): Promise<IpcResponse<SessionLineageProjection | null>> {
    return window.api.insight.lineage.getBySession(projectId, sessionId);
  },

  createSessionTask(
    projectId: string,
    input: CreateSessionTaskInput
  ): Promise<IpcResponse<TaskItem>> {
    return window.api.insight.lineage.createSessionTask(projectId, input);
  },

  readPlan(
    projectId: string,
    input: { sessionId: string; slug: string }
  ): Promise<IpcResponse<PlanDocument>> {
    return window.api.insight.lineage.readPlan(projectId, input);
  },

  savePlanBody(
    projectId: string,
    input: { sessionId: string; slug: string; body: string }
  ): Promise<IpcResponse<PlanDocument>> {
    return window.api.insight.lineage.savePlanBody(projectId, input);
  },

  approvePlan(
    projectId: string,
    input: { sessionId: string; slug: string }
  ): Promise<IpcResponse<PlanDocument>> {
    return window.api.insight.lineage.approvePlan(projectId, input);
  },
};
