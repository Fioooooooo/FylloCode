import { IpcErrorCodes } from "@shared/constants/error-codes";
import { ipcError } from "@shared/errors/ipc-error";

const OPENING_TAG = "<system-reminder>";
const CLOSING_TAG = "</system-reminder>";

export function wrapAsSystemReminder(body: string): string {
  if (body.includes(OPENING_TAG) || body.includes(CLOSING_TAG)) {
    throw ipcError(
      IpcErrorCodes.VALIDATION_ERROR,
      "System reminder body must not contain wrapper tags"
    );
  }

  return `${OPENING_TAG}\n${body}\n${CLOSING_TAG}`;
}
