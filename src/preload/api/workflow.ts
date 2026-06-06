import { ipcRenderer } from "electron";
import { WorkflowChannels } from "@shared/types/channels";
import type { IpcResponse } from "@shared/types/ipc";
import type {
  WorkflowDeleteRequest,
  WorkflowListRequest,
  WorkflowListResult,
  WorkflowSaveRequest,
} from "@shared/types/workflow";

export const workflowApi = {
  list(request: WorkflowListRequest = {}): Promise<IpcResponse<WorkflowListResult>> {
    return ipcRenderer.invoke(WorkflowChannels.list, request);
  },

  save(request: WorkflowSaveRequest): Promise<IpcResponse<void>> {
    return ipcRenderer.invoke(WorkflowChannels.save, request);
  },

  delete(request: WorkflowDeleteRequest): Promise<IpcResponse<void>> {
    return ipcRenderer.invoke(WorkflowChannels.delete, request);
  },
};
