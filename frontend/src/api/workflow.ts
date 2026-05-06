import type { IpcResponse } from "@shared/types/ipc";
import type {
  WorkflowDeleteRequest,
  WorkflowListRequest,
  WorkflowListResult,
  WorkflowSaveRequest,
} from "@shared/types/workflow";

export const workflowApi = {
  list(request: WorkflowListRequest = {}): Promise<IpcResponse<WorkflowListResult>> {
    return window.api.workflow.list(request);
  },

  save(request: WorkflowSaveRequest): Promise<IpcResponse<void>> {
    return window.api.workflow.save(request);
  },

  delete(request: WorkflowDeleteRequest): Promise<IpcResponse<void>> {
    return window.api.workflow.delete(request);
  },
};
