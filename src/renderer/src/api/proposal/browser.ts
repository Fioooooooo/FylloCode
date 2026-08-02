import type { IpcResponse } from "@shared/types/ipc";
import type {
  ProposalMeta,
  ProposalSpecDeltaOverview,
  ProposalStatusChangedPayload,
} from "@shared/types/proposal";

export const proposalBrowserApi = {
  list(workspaceId: string): Promise<IpcResponse<ProposalMeta[]>> {
    return window.api.proposal.browser.list(workspaceId);
  },

  readFile(
    workspaceId: string,
    changeId: string,
    filename: string
  ): Promise<IpcResponse<string | null>> {
    return window.api.proposal.browser.readFile(workspaceId, changeId, filename);
  },

  getSpecDeltas(
    workspaceId: string,
    changeId: string
  ): Promise<IpcResponse<ProposalSpecDeltaOverview>> {
    return window.api.proposal.browser.getSpecDeltas(workspaceId, changeId);
  },

  watch(input: {
    workspaceId: string;
    changeId: string;
    sessionId: string;
  }): Promise<IpcResponse<void>> {
    return window.api.proposal.browser.watch(input);
  },

  onStatusChanged(handler: (payload: ProposalStatusChangedPayload) => void): () => void {
    return window.api.proposal.browser.onStatusChanged(handler);
  },
};
