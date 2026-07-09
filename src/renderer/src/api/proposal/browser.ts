import type { IpcResponse } from "@shared/types/ipc";
import type {
  ProposalMeta,
  ProposalSpecDeltaOverview,
  ProposalStatusChangedPayload,
} from "@shared/types/proposal";

export const proposalBrowserApi = {
  list(projectId: string): Promise<IpcResponse<ProposalMeta[]>> {
    return window.api.proposal.browser.list(projectId);
  },

  readFile(
    projectId: string,
    changeId: string,
    filename: string
  ): Promise<IpcResponse<string | null>> {
    return window.api.proposal.browser.readFile(projectId, changeId, filename);
  },

  getSpecDeltas(
    projectId: string,
    changeId: string
  ): Promise<IpcResponse<ProposalSpecDeltaOverview>> {
    return window.api.proposal.browser.getSpecDeltas(projectId, changeId);
  },

  watch(input: {
    projectId: string;
    changeId: string;
    sessionId: string;
  }): Promise<IpcResponse<void>> {
    return window.api.proposal.browser.watch(input);
  },

  onStatusChanged(handler: (payload: ProposalStatusChangedPayload) => void): () => void {
    return window.api.proposal.browser.onStatusChanged(handler);
  },
};
