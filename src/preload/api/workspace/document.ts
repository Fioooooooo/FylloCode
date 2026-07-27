import { ipcRenderer } from "electron";
import { WorkspaceDocumentChannels } from "@shared/ipc/workspace/document.channels";
import type { IpcResponse } from "@shared/types/ipc";
import type {
  ConfirmLocalFilePreviewInput,
  LocalFilePreviewRequest,
  LocalFilePreviewResult,
} from "@shared/types/local-file-preview";

export const documentApi = {
  preparePreview(input: LocalFilePreviewRequest): Promise<IpcResponse<LocalFilePreviewResult>> {
    return ipcRenderer.invoke(WorkspaceDocumentChannels.preparePreview, input);
  },

  confirmPreview(
    input: ConfirmLocalFilePreviewInput
  ): Promise<IpcResponse<LocalFilePreviewResult>> {
    return ipcRenderer.invoke(WorkspaceDocumentChannels.confirmPreview, input);
  },
};
