import type { Message } from "@shared/types/chat";
import type { StreamContentEvent } from "@shared/types/stream-event";

/**
 * 主进程 ACP 会话事件。
 *
 * 复用跨进程同构的 `StreamContentEvent` 子集（判别字段 `kind`、工具类别 `toolKind`），
 * 再外挂主进程独有的控制流变体（`done`/`error`/`session_id_resolved`）。
 * 渲染态变体（`user_message`/`status`）只存在于 `MessageChunkData`，不在此出现。
 */
export type SessionEvent =
  | StreamContentEvent
  | { kind: "done"; totalTokens: number }
  | { kind: "error"; code: string; message: string }
  | { kind: "session_id_resolved"; acpSessionId: string };

export type { Message };
