import type { IpcResponse } from "@shared/types/ipc";
import type { IpcErrorCode } from "@shared/constants/error-codes";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import logger from "@main/utils/logger";

/**
 * Wraps an IPC handler body so it always produces an `IpcResponse<T>`.
 *
 * Caller code inside `fn` may throw either a standard `Error` or an error
 * produced by `ipcError(code, message)`; the wrapper normalises both into
 * the `{ ok: false, error }` shape and logs unexpected exceptions.
 */
export async function wrapHandler<T>(fn: () => Promise<T> | T): Promise<IpcResponse<T>> {
  try {
    const data = await fn();
    return { ok: true, data };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    const rawCode = (err as { code?: string }).code;
    const code: IpcErrorCode = isKnownCode(rawCode) ? rawCode : IpcErrorCodes.UNKNOWN_ERROR;

    if (code === IpcErrorCodes.UNKNOWN_ERROR) {
      logger.error("[ipc] unhandled error", err);
    }

    return { ok: false, error: { code, message: error.message } };
  }
}

function isKnownCode(code: string | undefined): code is IpcErrorCode {
  return typeof code === "string" && code in IpcErrorCodes;
}
