import { ipcRenderer } from "electron";
import { ProposalBrowserChannels } from "@shared/ipc/proposal/browser.channels";
import type { IpcResponse } from "@shared/types/ipc";
import type {
  ProposalMeta,
  ProposalRef,
  ProposalSpecDeltaOverview,
  ProposalStatusChangedPayload,
} from "@shared/types/proposal";

export const proposalBrowserApi = {
  list(workspaceId: string): Promise<IpcResponse<ProposalMeta[]>> {
    return ipcRenderer.invoke(ProposalBrowserChannels.list, { workspaceId });
  },

  readFile(
    workspaceId: string,
    proposalRef: ProposalRef,
    filename: string
  ): Promise<IpcResponse<string | null>> {
    return ipcRenderer.invoke(ProposalBrowserChannels.readFile, {
      workspaceId,
      ...proposalRef,
      filename,
    });
  },

  getSpecDeltas(
    workspaceId: string,
    proposalRef: ProposalRef
  ): Promise<IpcResponse<ProposalSpecDeltaOverview>> {
    return ipcRenderer.invoke(ProposalBrowserChannels.getSpecDeltas, {
      workspaceId,
      ...proposalRef,
    });
  },

  watch(
    input: { workspaceId: string; sessionId: string } & ProposalRef
  ): Promise<IpcResponse<void>> {
    return ipcRenderer.invoke(ProposalBrowserChannels.watch, input);
  },

  onStatusChanged(listener: (payload: ProposalStatusChangedPayload) => void): () => void {
    const handler = (_event: Electron.IpcRendererEvent, payload: ProposalStatusChangedPayload) => {
      listener(payload);
    };
    ipcRenderer.on(ProposalBrowserChannels.statusChanged, handler);
    return () => {
      ipcRenderer.off(ProposalBrowserChannels.statusChanged, handler);
    };
  },
};
