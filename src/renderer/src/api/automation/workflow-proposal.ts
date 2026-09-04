import type { IpcResponse } from "@shared/types/ipc";
import type {
  WorkflowProposalCancelResult,
  WorkflowProposalConfirmRequest,
  WorkflowProposalConfirmResult,
  WorkflowProposalDecisionListResult,
  WorkflowProposalDetail,
  WorkflowProposalDetailRequest,
  WorkflowProposalListRequest,
  WorkflowProposalListResult,
  WorkflowProposalWakePayload,
} from "@shared/types/workflow";
import type { AppOwnedChatStreamCallbacks } from "@renderer/api/session/chat";

export type WorkflowProposalDecisionStreamCallbacks = AppOwnedChatStreamCallbacks<void>;
export type WorkflowProposalConfirmStreamCallbacks =
  AppOwnedChatStreamCallbacks<WorkflowProposalConfirmResult>;

export const workflowProposalApi = {
  list(request: WorkflowProposalListRequest): Promise<IpcResponse<WorkflowProposalListResult>> {
    return window.api.automation.workflowProposal.list(request);
  },

  getDetail(request: WorkflowProposalDetailRequest): Promise<IpcResponse<WorkflowProposalDetail>> {
    return window.api.automation.workflowProposal.getDetail(request);
  },

  confirm(
    request: WorkflowProposalConfirmRequest
  ): Promise<IpcResponse<WorkflowProposalConfirmResult>> {
    return window.api.automation.workflowProposal.confirm(request);
  },

  confirmDispatch(
    request: WorkflowProposalConfirmRequest,
    callbacks: WorkflowProposalConfirmStreamCallbacks
  ): () => void {
    return window.api.automation.workflowProposal.confirmDispatch(request, callbacks);
  },

  cancel(
    request: WorkflowProposalDetailRequest
  ): Promise<IpcResponse<WorkflowProposalCancelResult>> {
    return window.api.automation.workflowProposal.cancel(request);
  },

  onWake(handler: (payload: WorkflowProposalWakePayload) => void): () => void {
    return window.api.automation.workflowProposal.onWake(handler);
  },

  decisionList(workspaceId: string): Promise<IpcResponse<WorkflowProposalDecisionListResult>> {
    return window.api.automation.workflowProposal.decisionList(workspaceId);
  },

  decisionDispatch(
    workspaceId: string,
    notificationId: string,
    parentSessionId: string,
    callbacks: WorkflowProposalDecisionStreamCallbacks
  ): () => void {
    return window.api.automation.workflowProposal.decisionDispatch(
      workspaceId,
      notificationId,
      parentSessionId,
      callbacks
    );
  },

  onDecisionWake(handler: (payload: { workspaceId: string }) => void): () => void {
    return window.api.automation.workflowProposal.onDecisionWake(handler);
  },
};
