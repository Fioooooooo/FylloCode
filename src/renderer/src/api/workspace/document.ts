import type { IpcResponse } from "@shared/types/ipc";
import type {
  ConfirmLocalFilePreviewInput,
  LocalFilePreviewRequest,
  LocalFilePreviewResult,
} from "@shared/types/local-file-preview";

export const documentApi = {
  preparePreview(input: LocalFilePreviewRequest): Promise<IpcResponse<LocalFilePreviewResult>> {
    return window.api.workspace.document.preparePreview(input);
  },

  confirmPreview(
    input: ConfirmLocalFilePreviewInput
  ): Promise<IpcResponse<LocalFilePreviewResult>> {
    return window.api.workspace.document.confirmPreview(input);
  },
};
