import type { IpcResponse } from "@shared/types/ipc";
import type {
  ProposalMeta,
  ProposalRef,
  ProposalSpecDeltaOverview,
  ProposalStatusChangedPayload,
} from "@shared/types/proposal";

export const proposalBrowserApi = {
  list(workspaceId: string): Promise<IpcResponse<ProposalMeta[]>> {
    return window.api.proposal.browser.list(workspaceId);
  },

  readFile(
    workspaceId: string,
    proposalRef: ProposalRef,
    filename: string
  ): Promise<IpcResponse<string | null>> {
    return window.api.proposal.browser.readFile(workspaceId, proposalRef, filename);
  },

  getSpecDeltas(
    workspaceId: string,
    proposalRef: ProposalRef
  ): Promise<IpcResponse<ProposalSpecDeltaOverview>> {
    return window.api.proposal.browser.getSpecDeltas(workspaceId, proposalRef);
  },

  watch(
    input: { workspaceId: string; sessionId: string } & ProposalRef
  ): Promise<IpcResponse<void>> {
    return window.api.proposal.browser.watch(input);
  },

  onStatusChanged(handler: (payload: ProposalStatusChangedPayload) => void): () => void {
    return window.api.proposal.browser.onStatusChanged(handler);
  },
};
