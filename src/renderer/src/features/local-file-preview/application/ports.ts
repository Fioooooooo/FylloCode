import type { IpcResponse } from "@shared/types/ipc";
import type {
  ConfirmLocalFilePreviewInput,
  LocalFilePreviewRequest,
  LocalFilePreviewResult,
} from "@shared/types/local-file-preview";

export interface WorkspaceDocumentPreviewPort {
  preparePreview(input: LocalFilePreviewRequest): Promise<IpcResponse<LocalFilePreviewResult>>;
  confirmPreview(input: ConfirmLocalFilePreviewInput): Promise<IpcResponse<LocalFilePreviewResult>>;
}
