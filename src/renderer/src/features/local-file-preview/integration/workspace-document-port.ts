import { documentApi } from "@renderer/api/workspace/document";
import type { WorkspaceDocumentPreviewPort } from "../application/ports";

export const workspaceDocumentPreviewPort: WorkspaceDocumentPreviewPort = {
  preparePreview: (input) => documentApi.preparePreview(input),
  confirmPreview: (input) => documentApi.confirmPreview(input),
};
