import { ipcRenderer } from "electron";
import { InsightLineageChannels } from "@shared/ipc/insight/lineage.channels";
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
    return ipcRenderer.invoke(InsightLineageChannels.getBrowser, { projectId });
  },

  ensureTaskSubject(
    projectId: string,
    snapshot: LineageTaskSnapshot
  ): Promise<IpcResponse<Subject>> {
    return ipcRenderer.invoke(InsightLineageChannels.ensureTaskSubject, { projectId, snapshot });
  },

  linkTaskSession(
    projectId: string,
    taskRef: LineageTaskRef,
    sessionId: string
  ): Promise<IpcResponse<Subject | null>> {
    return ipcRenderer.invoke(InsightLineageChannels.linkTaskSession, {
      projectId,
      taskRef,
      sessionId,
    });
  },

  getByTask(
    projectId: string,
    ref: LineageTaskRef
  ): Promise<IpcResponse<TaskDownstreamProjection | null>> {
    return ipcRenderer.invoke(InsightLineageChannels.getByTask, { projectId, ref });
  },

  getBySession(
    projectId: string,
    sessionId: string
  ): Promise<IpcResponse<SessionLineageProjection | null>> {
    return ipcRenderer.invoke(InsightLineageChannels.getBySession, { projectId, sessionId });
  },

  createSessionTask(
    projectId: string,
    input: CreateSessionTaskInput
  ): Promise<IpcResponse<TaskItem>> {
    return ipcRenderer.invoke(InsightLineageChannels.createSessionTask, { projectId, ...input });
  },

  readPlan(
    projectId: string,
    input: { sessionId: string; slug: string }
  ): Promise<IpcResponse<PlanDocument>> {
    return ipcRenderer.invoke(InsightLineageChannels.readPlan, { projectId, ...input });
  },

  savePlanBody(
    projectId: string,
    input: { sessionId: string; slug: string; body: string }
  ): Promise<IpcResponse<PlanDocument>> {
    return ipcRenderer.invoke(InsightLineageChannels.savePlanBody, { projectId, ...input });
  },

  approvePlan(
    projectId: string,
    input: { sessionId: string; slug: string }
  ): Promise<IpcResponse<PlanDocument>> {
    return ipcRenderer.invoke(InsightLineageChannels.approvePlan, { projectId, ...input });
  },
};
