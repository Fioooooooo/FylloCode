export const LOCAL_FILE_PREVIEW_MAX_BYTES = 5 * 1024 * 1024;

export type LocalFilePreviewErrorCode =
  | "FILE_NOT_FOUND"
  | "NOT_REGULAR_FILE"
  | "FILE_TOO_LARGE"
  | "BINARY_FILE"
  | "INVALID_UTF8"
  | "PERMISSION_DENIED"
  | "AUTHORIZATION_INVALID"
  | "FILE_CHANGED"
  | "READ_FAILED";

export interface LocalFilePreviewRequest {
  requestedPath: string;
}

export interface LocalFilePreviewLocation {
  line?: number;
  column?: number;
}

export interface LocalFilePreviewDocument extends LocalFilePreviewLocation {
  requestedPath: string;
  canonicalPath: string;
  content: string;
  language: string;
  size: number;
  mtimeMs: number;
}

export interface LocalFilePreviewReadyResult {
  status: "ready";
  document: LocalFilePreviewDocument;
}

export interface LocalFilePreviewConfirmationResult extends LocalFilePreviewLocation {
  status: "confirmation-required";
  authorizationId: string;
  requestedPath: string;
  canonicalPath: string;
  size: number;
  mtimeMs: number;
}

export interface LocalFilePreviewErrorResult {
  status: "error";
  code: LocalFilePreviewErrorCode;
  message: string;
  requestedPath?: string;
  canonicalPath?: string;
}

export type LocalFilePreviewResult =
  LocalFilePreviewReadyResult | LocalFilePreviewConfirmationResult | LocalFilePreviewErrorResult;

export interface ConfirmLocalFilePreviewInput {
  authorizationId: string;
  rememberForWindow: boolean;
}
