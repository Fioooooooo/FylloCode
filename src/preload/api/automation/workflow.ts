import { ipcRenderer } from "electron";
import { AutomationWorkflowChannels } from "@shared/ipc/automation/workflow.channels";
import type { IpcResponse } from "@shared/types/ipc";
import type {
  WorkflowDeleteRequest,
  WorkflowListRequest,
  WorkflowListResult,
  WorkflowSaveRequest,
} from "@shared/types/workflow";

export const workflowApi = {
  list(request: WorkflowListRequest = {}): Promise<IpcResponse<WorkflowListResult>> {
    return ipcRenderer.invoke(AutomationWorkflowChannels.list, request);
  },

  save(request: WorkflowSaveRequest): Promise<IpcResponse<void>> {
    return ipcRenderer.invoke(AutomationWorkflowChannels.save, request);
  },

  delete(request: WorkflowDeleteRequest): Promise<IpcResponse<void>> {
    return ipcRenderer.invoke(AutomationWorkflowChannels.delete, request);
  },
};
