import { ipcRenderer } from "electron";
import { AutomationWorkflowRunChannels } from "@shared/ipc/automation/workflow-run.channels";
import type {
  WorkflowRunDetail,
  WorkflowRunDetailRequest,
  WorkflowRunDecisionRequest,
  WorkflowRunListRequest,
  WorkflowRunListResult,
  WorkflowRunWakePayload,
} from "@shared/types/workflow";
import type { IpcResponse } from "@shared/types/ipc";

export const workflowRunApi = {
  list(request: WorkflowRunListRequest): Promise<IpcResponse<WorkflowRunListResult>> {
    return ipcRenderer.invoke(AutomationWorkflowRunChannels.list, request);
  },

  getDetail(request: WorkflowRunDetailRequest): Promise<IpcResponse<WorkflowRunDetail>> {
    return ipcRenderer.invoke(AutomationWorkflowRunChannels.getDetail, request);
  },

  decide(request: WorkflowRunDecisionRequest): Promise<IpcResponse<WorkflowRunDetail>> {
    return ipcRenderer.invoke(AutomationWorkflowRunChannels.decide, request);
  },

  onWake(handler: (payload: WorkflowRunWakePayload) => void): () => void {
    const listener = (_event: Electron.IpcRendererEvent, payload: WorkflowRunWakePayload): void =>
      handler(payload);
    ipcRenderer.on(AutomationWorkflowRunChannels.wake, listener);
    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      ipcRenderer.off(AutomationWorkflowRunChannels.wake, listener);
    };
  },
};
