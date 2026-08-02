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
  getBrowser(workspaceId: string): Promise<IpcResponse<LineageBrowserData>> {
    return window.api.insight.lineage.getBrowser(workspaceId);
  },

  ensureTaskSubject(
    workspaceId: string,
    snapshot: LineageTaskSnapshot
  ): Promise<IpcResponse<Subject>> {
    return window.api.insight.lineage.ensureTaskSubject(workspaceId, snapshot);
  },

  linkTaskSession(
    workspaceId: string,
    taskRef: LineageTaskRef,
    sessionId: string
  ): Promise<IpcResponse<Subject | null>> {
    return window.api.insight.lineage.linkTaskSession(workspaceId, taskRef, sessionId);
  },

  getByTask(
    workspaceId: string,
    ref: LineageTaskRef
  ): Promise<IpcResponse<TaskDownstreamProjection | null>> {
    return window.api.insight.lineage.getByTask(workspaceId, ref);
  },

  getBySession(
    workspaceId: string,
    sessionId: string
  ): Promise<IpcResponse<SessionLineageProjection | null>> {
    return window.api.insight.lineage.getBySession(workspaceId, sessionId);
  },

  createSessionTask(
    workspaceId: string,
    input: CreateSessionTaskInput
  ): Promise<IpcResponse<TaskItem>> {
    return window.api.insight.lineage.createSessionTask(workspaceId, input);
  },

  readPlan(
    workspaceId: string,
    input: { sessionId: string; slug: string }
  ): Promise<IpcResponse<PlanDocument>> {
    return window.api.insight.lineage.readPlan(workspaceId, input);
  },

  savePlanBody(
    workspaceId: string,
    input: { sessionId: string; slug: string; body: string }
  ): Promise<IpcResponse<PlanDocument>> {
    return window.api.insight.lineage.savePlanBody(workspaceId, input);
  },

  approvePlan(
    workspaceId: string,
    input: { sessionId: string; slug: string }
  ): Promise<IpcResponse<PlanDocument>> {
    return window.api.insight.lineage.approvePlan(workspaceId, input);
  },
};
