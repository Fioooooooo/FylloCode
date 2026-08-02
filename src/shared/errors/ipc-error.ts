import type { IpcErrorCode } from "../constants/error-codes";

/** Error carrying an `IpcErrorCode` on its `code` field. */
export interface IpcError extends Error {
  code: IpcErrorCode;
  details?: unknown;
}

/** Construct a domain error whose `code` is guaranteed to be a known `IpcErrorCode`. */
export function ipcError(code: IpcErrorCode, message: string, details?: unknown): IpcError {
  const error = new Error(message) as IpcError;
  error.code = code;
  error.details = details;
  return error;
}
