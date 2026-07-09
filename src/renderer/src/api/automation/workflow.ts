import type { IpcResponse } from "@shared/types/ipc";
import type {
  WorkflowDeleteRequest,
  WorkflowListRequest,
  WorkflowListResult,
  WorkflowSaveRequest,
} from "@shared/types/workflow";

export const workflowApi = {
  list(request: WorkflowListRequest = {}): Promise<IpcResponse<WorkflowListResult>> {
    return window.api.automation.workflow.list(request);
  },

  save(request: WorkflowSaveRequest): Promise<IpcResponse<void>> {
    return window.api.automation.workflow.save(request);
  },

  delete(request: WorkflowDeleteRequest): Promise<IpcResponse<void>> {
    return window.api.automation.workflow.delete(request);
  },
};
