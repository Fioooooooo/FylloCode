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
  getBrowser(workspaceId: string): Promise<IpcResponse<LineageBrowserData>> {
    return ipcRenderer.invoke(InsightLineageChannels.getBrowser, { workspaceId });
  },

  ensureTaskSubject(
    workspaceId: string,
    snapshot: LineageTaskSnapshot
  ): Promise<IpcResponse<Subject>> {
    return ipcRenderer.invoke(InsightLineageChannels.ensureTaskSubject, { workspaceId, snapshot });
  },

  linkTaskSession(
    workspaceId: string,
    taskRef: LineageTaskRef,
    sessionId: string
  ): Promise<IpcResponse<Subject | null>> {
    return ipcRenderer.invoke(InsightLineageChannels.linkTaskSession, {
      workspaceId,
      taskRef,
      sessionId,
    });
  },

  getByTask(
    workspaceId: string,
    ref: LineageTaskRef
  ): Promise<IpcResponse<TaskDownstreamProjection | null>> {
    return ipcRenderer.invoke(InsightLineageChannels.getByTask, { workspaceId, ref });
  },

  getBySession(
    workspaceId: string,
    sessionId: string
  ): Promise<IpcResponse<SessionLineageProjection | null>> {
    return ipcRenderer.invoke(InsightLineageChannels.getBySession, { workspaceId, sessionId });
  },

  createSessionTask(
    workspaceId: string,
    input: CreateSessionTaskInput
  ): Promise<IpcResponse<TaskItem>> {
    return ipcRenderer.invoke(InsightLineageChannels.createSessionTask, { workspaceId, ...input });
  },

  readPlan(
    workspaceId: string,
    input: { sessionId: string; slug: string }
  ): Promise<IpcResponse<PlanDocument>> {
    return ipcRenderer.invoke(InsightLineageChannels.readPlan, { workspaceId, ...input });
  },

  savePlanBody(
    workspaceId: string,
    input: { sessionId: string; slug: string; body: string }
  ): Promise<IpcResponse<PlanDocument>> {
    return ipcRenderer.invoke(InsightLineageChannels.savePlanBody, { workspaceId, ...input });
  },

  approvePlan(
    workspaceId: string,
    input: { sessionId: string; slug: string }
  ): Promise<IpcResponse<PlanDocument>> {
    return ipcRenderer.invoke(InsightLineageChannels.approvePlan, { workspaceId, ...input });
  },
};
