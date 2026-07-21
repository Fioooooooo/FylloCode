import type { AcpSessionConfigOption } from "./acp-config";
import type { AcpAvailableCommand, AgendaEntry } from "./chat";

/**
 * 跨进程同构的流式内容事件子集。
 *
 * 主进程的 `SessionEvent`（@main/domain/session/chat/session-events）与跨进程的
 * `MessageChunkData`（@shared/types/ipc）都以此为公共基底：
 * - `SessionEvent = StreamContentEvent | <主进程控制流变体>`（done/error/session_id_resolved）
 * - `MessageChunkData = StreamContentEvent | <渲染态变体>`（user_message/status）
 *
 * 判别字段统一为 `kind`；工具类别字段统一为 `toolKind`（与外层判别字段区分）。
 * 本文件不得 import `@agentclientprotocol/sdk`，以保持 shared/preload/renderer 脱 SDK。
 */

/** 工具调用产生的文件 diff（对应 ACP content[].type === "diff"）。 */
export interface ToolCallDiff {
  path: string;
  newText: string;
  /** undefined = 新建文件（对应 ACP 文档 "null for new files"）。 */
  oldText?: string;
}

/** 工具调用涉及的文件定位（对应 ACP tool call locations[]）。 */
export interface ToolCallLocation {
  path: string;
  line?: number;
}

export type StreamContentEvent =
  | { kind: "text_delta"; text: string }
  | { kind: "reasoning_delta"; text: string }
  | {
      kind: "tool_call_start";
      toolCallId: string;
      /** 稳定工具身份；旧事件可缺失并由 assembler 回退到 title。 */
      toolName?: string;
      /** ACP 提供的人类可读描述。 */
      title: string;
      toolKind: string;
      /** 预留：start 时已有 rawInput（codex/qodercli）。 */
      input?: Record<string, unknown>;
      /** 预留：start 时已有 diff（codex edit）。 */
      diff?: ToolCallDiff[];
      /** 预留：本期透传，UI 暂不消费。 */
      locations?: ToolCallLocation[];
      /** 预留：sub-agent 嵌套，本期不消费。 */
      parentToolCallId?: string;
    }
  | {
      kind: "tool_call_update";
      toolCallId: string;
      status: "in_progress" | "completed" | "failed";
      /** 更新稳定工具身份；主要用于缺失 start 的工具调用。 */
      toolName?: string;
      input?: Record<string, unknown>;
      content?: string;
      /** 工具执行中的增量输出；不得作为 title 使用。 */
      outputDelta?: string;
      /** 从 content[].type === "diff" 提取。 */
      diff?: ToolCallDiff[];
      /** 预留：本期透传，UI 暂不消费。 */
      locations?: ToolCallLocation[];
      /** 人类可读标题更新；孤儿 update 也用它建卡。 */
      title?: string;
      /** 孤儿 update 补偿所需。 */
      toolKind?: string;
      /** 子代理嵌套：claude parentToolUseId。本期透传至渲染层，UI 暂不消费。 */
      parentToolCallId?: string;
    }
  | {
      kind: "usage_update";
      used: number;
      size: number;
      cost?: { amount: number; currency: string };
    }
  | { kind: "session_info_update"; title: string }
  | { kind: "available_commands_update"; commands: AcpAvailableCommand[] }
  | { kind: "agenda_update"; entries: AgendaEntry[] }
  | { kind: "config_options_update"; options: AcpSessionConfigOption[] };
