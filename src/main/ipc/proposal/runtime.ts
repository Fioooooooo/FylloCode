import { generateId, type UIMessage } from "ai";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import type { MessageMeta } from "@shared/types/chat";
import { ipcError } from "../_kit/errors";

export function buildProposalRunUserMessage(
  sessionId: string,
  text: string
): UIMessage<MessageMeta> {
  return {
    id: generateId(),
    role: "user",
    parts: [{ type: "text", text }],
    metadata: { sessionId, createdAt: new Date() },
  };
}

export function applyRunPersistError(error: unknown): Error {
  return ipcError(
    IpcErrorCodes.APPLY_RUN_PERSIST_FAILED,
    error instanceof Error ? error.message : String(error)
  );
}
