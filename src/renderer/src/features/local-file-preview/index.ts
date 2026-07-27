export { parseLocalFileLink, type LocalFileLinkTarget } from "./model/local-file-link";
export type { LocalFilePreviewState } from "./model/preview-state";
export {
  createLocalFilePreviewController,
  type LocalFilePreviewController,
} from "./application/local-file-preview-controller";
export type { WorkspaceDocumentPreviewPort } from "./application/ports";
export { useLocalFilePreview } from "./integration/use-local-file-preview";
