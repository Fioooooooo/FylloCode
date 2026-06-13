import type { SessionEvent } from "@main/domain/chat/session-events";
import type { MessageChunkData } from "@shared/types/ipc";
import { IpcErrorCodes, type IpcErrorCode } from "@shared/constants/error-codes";

/**
 * Map an ACP session event to the renderer-facing stream chunk representation.
 *
 * `SessionEvent` 与 `MessageChunkData` 共享 `StreamContentEvent` 子集，因此同构成员
 * 直接结构化透传（深拷贝一次以适配跨 MessagePort 序列化）；仅主进程独有的控制流事件
 * （`done`/`error`/`session_id_resolved`）返回 `null`，不进入 chunk 通路。
 */
export function toMessageChunk(ev: SessionEvent): MessageChunkData | null {
  switch (ev.kind) {
    case "done":
    case "error":
    case "session_id_resolved":
      return null;
    default:
      return JSON.parse(JSON.stringify(ev)) as MessageChunkData;
  }
}

/**
 * Map the raw `code` carried on an ACP `error` session event to a known
 * `IpcErrorCode`. Recognised transport/lifecycle codes pass through verbatim;
 * everything else collapses to the generic `ACP_ERROR`. Shared by every ACP
 * stream handler (chat / apply / archive) so the mapping stays single-sourced.
 */
export function mapAcpErrorCode(raw: string): IpcErrorCode {
  if (raw === IpcErrorCodes.ACP_NOT_READY) return IpcErrorCodes.ACP_NOT_READY;
  if (raw === IpcErrorCodes.ACP_EXIT_GIVEUP) return IpcErrorCodes.ACP_EXIT_GIVEUP;
  if (raw === IpcErrorCodes.SPAWN_ERROR) return IpcErrorCodes.SPAWN_ERROR;
  if (raw === IpcErrorCodes.PROMPT_CAPABILITY_MISMATCH) {
    return IpcErrorCodes.PROMPT_CAPABILITY_MISMATCH;
  }
  return IpcErrorCodes.ACP_ERROR;
}
