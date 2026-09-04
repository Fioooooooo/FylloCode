import { ipcRenderer } from "electron";
import { AutomationWorkflowProposalChannels } from "@shared/ipc/automation/workflow-proposal.channels";
import { AutomationWorkflowProposalDecisionChannels } from "@shared/ipc/automation/workflow-proposal-decision.channels";
import type {
  WorkflowProposalCancelResult,
  WorkflowProposalConfirmRequest,
  WorkflowProposalConfirmDispatchRequest,
  WorkflowProposalConfirmResult,
  WorkflowProposalDecisionListResult,
  WorkflowProposalDetail,
  WorkflowProposalDetailRequest,
  WorkflowProposalListRequest,
  WorkflowProposalListResult,
  WorkflowProposalWakePayload,
} from "@shared/types/workflow";
import type { IpcResponse } from "@shared/types/ipc";
import { dispatchAppOwnedChatStream, type AppOwnedChatStreamCallbacks } from "../session/chat";

export type WorkflowProposalDecisionStreamCallbacks = AppOwnedChatStreamCallbacks<void>;
export type WorkflowProposalConfirmStreamCallbacks =
  AppOwnedChatStreamCallbacks<WorkflowProposalConfirmResult>;

export const workflowProposalApi = {
  list(request: WorkflowProposalListRequest): Promise<IpcResponse<WorkflowProposalListResult>> {
    return ipcRenderer.invoke(AutomationWorkflowProposalChannels.list, request);
  },

  getDetail(request: WorkflowProposalDetailRequest): Promise<IpcResponse<WorkflowProposalDetail>> {
    return ipcRenderer.invoke(AutomationWorkflowProposalChannels.getDetail, request);
  },

  confirm(
    request: WorkflowProposalConfirmRequest
  ): Promise<IpcResponse<WorkflowProposalConfirmResult>> {
    return ipcRenderer.invoke(AutomationWorkflowProposalChannels.confirm, request);
  },

  confirmDispatch(
    request: WorkflowProposalConfirmRequest,
    callbacks: WorkflowProposalConfirmStreamCallbacks
  ): () => void {
    return dispatchAppOwnedChatStream<
      WorkflowProposalConfirmResult,
      WorkflowProposalConfirmDispatchRequest
    >(
      AutomationWorkflowProposalChannels.confirmDispatch,
      request.workspaceId,
      request.parentSessionId,
      (streamId) => ({ ...request, streamId }),
      callbacks
    );
  },

  cancel(
    request: WorkflowProposalDetailRequest
  ): Promise<IpcResponse<WorkflowProposalCancelResult>> {
    return ipcRenderer.invoke(AutomationWorkflowProposalChannels.cancel, request);
  },

  onWake(handler: (payload: WorkflowProposalWakePayload) => void): () => void {
    const listener = (_event: Electron.IpcRendererEvent, payload: WorkflowProposalWakePayload) =>
      handler(payload);
    ipcRenderer.on(AutomationWorkflowProposalChannels.wake, listener);
    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      ipcRenderer.off(AutomationWorkflowProposalChannels.wake, listener);
    };
  },

  decisionList(workspaceId: string): Promise<IpcResponse<WorkflowProposalDecisionListResult>> {
    return ipcRenderer.invoke(AutomationWorkflowProposalDecisionChannels.list, { workspaceId });
  },

  decisionDispatch(
    workspaceId: string,
    notificationId: string,
    parentSessionId: string,
    callbacks: WorkflowProposalDecisionStreamCallbacks
  ): () => void {
    return dispatchAppOwnedChatStream(
      AutomationWorkflowProposalDecisionChannels.dispatch,
      workspaceId,
      parentSessionId,
      (streamId) => ({ workspaceId, notificationId, streamId }),
      callbacks
    );
  },

  onDecisionWake(handler: (payload: { workspaceId: string }) => void): () => void {
    const listener = (_event: Electron.IpcRendererEvent, payload: { workspaceId: string }): void =>
      handler(payload);
    ipcRenderer.on(AutomationWorkflowProposalDecisionChannels.wake, listener);
    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      ipcRenderer.off(AutomationWorkflowProposalDecisionChannels.wake, listener);
    };
  },
};
