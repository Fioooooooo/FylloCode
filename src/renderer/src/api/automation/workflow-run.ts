import type { IpcResponse } from "@shared/types/ipc";
import type {
  WorkflowRunDetail,
  WorkflowRunDetailRequest,
  WorkflowRunDecisionRequest,
  WorkflowRunListRequest,
  WorkflowRunListResult,
  WorkflowRunWakePayload,
} from "@shared/types/workflow";

export const workflowRunApi = {
  list(request: WorkflowRunListRequest): Promise<IpcResponse<WorkflowRunListResult>> {
    return window.api.automation.workflowRun.list(request);
  },

  getDetail(request: WorkflowRunDetailRequest): Promise<IpcResponse<WorkflowRunDetail>> {
    return window.api.automation.workflowRun.getDetail(request);
  },

  decide(request: WorkflowRunDecisionRequest): Promise<IpcResponse<WorkflowRunDetail>> {
    return window.api.automation.workflowRun.decide(request);
  },

  onWake(handler: (payload: WorkflowRunWakePayload) => void): () => void {
    return window.api.automation.workflowRun.onWake(handler);
  },
};
