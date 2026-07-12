import { collectPendingFylloActionRailItems } from "@renderer/utils/fyllo-action-rail";
import type { PendingFylloActionRailItem } from "@renderer/utils/fyllo-action-rail";
import type { ChatStatus, Session } from "@shared/types/chat";
import type { ChatPromptPart } from "@shared/types/chat-prompt";
import type { FylloActionDispatchHandler } from "./types";
import { requireSessionId } from "./types";

interface KnowledgeFlagActionHandlerDependencies {
  getChatStatus: () => ChatStatus;
  getActiveSession: () => Session | null | undefined;
  sendMessage: (parts: ChatPromptPart[]) => Promise<void>;
}

interface KnowledgeCaptureCandidate {
  summary: string;
  contextPaths?: string[];
}

function escapeSystemReminderText(value: string): string {
  return value.replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
}

function toKnowledgeCaptureCandidate(item: PendingFylloActionRailItem): KnowledgeCaptureCandidate {
  return {
    summary: item.summary ?? item.type,
    contextPaths: item.contextPaths,
  };
}

function buildCandidateLines(candidates: KnowledgeCaptureCandidate[]): string[] {
  return candidates.flatMap((candidate, index) => {
    const lines = [`${index + 1}. summary: ${escapeSystemReminderText(candidate.summary)}`];

    if (candidate.contextPaths?.length) {
      lines.push("   contextPaths:");
      lines.push(...candidate.contextPaths.map((path) => `   - ${escapeSystemReminderText(path)}`));
    } else {
      lines.push("   contextPaths: (none)");
    }

    return lines;
  });
}

function buildKnowledgeCaptureSystemReminder(candidates: KnowledgeCaptureCandidate[]): string {
  return [
    "<system-reminder>",
    "这是一次用户确认触发的 durable knowledge capture 请求。",
    "",
    '请先调用 `mcp__fyllo_cortex__knowledge({ "mode": "capture" })` 获取当前 knowledge state、knowledgeRoot 和 capture instruction，并以 tool 返回的 instruction 作为写入与审阅流程的准则。',
    "",
    "候选来自当前已加载会话中的 pending `knowledge.flag` actions。候选可能重复、过期或不符合准入测试；请按 tool instruction 查重、验证和筛选。",
    "",
    "候选：",
    ...buildCandidateLines(candidates),
    "",
    "完成处理后，只对实际创建或更新的 knowledge entry 输出 `knowledge.review` action。如果无可创建的 knowledge，无需向用户提及 `knowledge.review` 的存在。",
    "</system-reminder>",
  ].join("\n");
}

function buildKnowledgeCaptureVisibleText(count: number): string {
  if (count > 1) {
    return `请把刚才标记的 ${count} 条可沉淀内容整理为项目知识，并在完成后让我审阅。`;
  }

  return "请把刚才标记的可沉淀内容整理为项目知识，并在完成后让我审阅。";
}

function buildKnowledgeCaptureParts(candidates: KnowledgeCaptureCandidate[]): ChatPromptPart[] {
  return [
    {
      type: "text",
      text: buildKnowledgeCaptureSystemReminder(candidates),
    },
    {
      type: "text",
      text: buildKnowledgeCaptureVisibleText(candidates.length),
    },
  ];
}

function canSendChatMessage(status: ChatStatus): boolean {
  return status !== "submitted" && status !== "streaming";
}

export function createKnowledgeFlagActionHandler(
  dependencies: KnowledgeFlagActionHandlerDependencies
): FylloActionDispatchHandler<"knowledge.flag"> {
  return async (payload, runtime) => {
    const sessionId = requireSessionId(
      runtime.context,
      "当前聊天会话缺少 sessionId，无法沉淀知识。"
    );
    if (typeof sessionId !== "string") {
      return sessionId;
    }

    const activeSession = dependencies.getActiveSession();
    const pendingFlags = collectPendingFylloActionRailItems(activeSession ?? null).filter(
      (item) => item.type === "knowledge.flag"
    );
    const candidates =
      pendingFlags.length > 0
        ? pendingFlags.map(toKnowledgeCaptureCandidate)
        : [{ summary: payload.summary, contextPaths: payload.contextPaths }];

    if (!canSendChatMessage(dependencies.getChatStatus())) {
      return {
        outcome: "failed",
        error: "请等待当前 assistant 回复结束后再沉淀知识。",
      };
    }

    await dependencies.sendMessage(buildKnowledgeCaptureParts(candidates));
    const completedActionIds = pendingFlags.map((item) => item.actionId);
    if (completedActionIds.length === 0) {
      return { outcome: "succeeded" };
    }

    return {
      outcome: "succeeded",
      completedActionIds,
    };
  };
}
