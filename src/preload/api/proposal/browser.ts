import { ipcRenderer } from "electron";
import { ProposalBrowserChannels } from "@shared/ipc/proposal/browser.channels";
import type { IpcResponse } from "@shared/types/ipc";
import type {
  ProposalMeta,
  ProposalSpecDeltaOverview,
  ProposalStatusChangedPayload,
} from "@shared/types/proposal";

export const proposalBrowserApi = {
  list(projectId: string): Promise<IpcResponse<ProposalMeta[]>> {
    return ipcRenderer.invoke(ProposalBrowserChannels.list, { projectId });
  },

  readFile(
    projectId: string,
    changeId: string,
    filename: string
  ): Promise<IpcResponse<string | null>> {
    return ipcRenderer.invoke(ProposalBrowserChannels.readFile, { projectId, changeId, filename });
  },

  getSpecDeltas(
    projectId: string,
    changeId: string
  ): Promise<IpcResponse<ProposalSpecDeltaOverview>> {
    return ipcRenderer.invoke(ProposalBrowserChannels.getSpecDeltas, { projectId, changeId });
  },

  watch(input: {
    projectId: string;
    changeId: string;
    sessionId: string;
  }): Promise<IpcResponse<void>> {
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
