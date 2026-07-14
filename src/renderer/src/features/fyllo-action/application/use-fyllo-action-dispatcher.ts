import { usePlanSlideover } from "@renderer/composables/usePlanSlideover";
import { useKnowledgeReviewSlideover } from "@renderer/composables/useKnowledgeReviewSlideover";
import { useChatStore, useLineageStore, useProjectStore, useSessionStore } from "@renderer/stores";
import type {
  FylloActionHandlerResult,
  FylloActionPayloadByType,
  FylloActionType,
} from "@shared/fyllo-action/protocol";
import { createTaskCreateActionHandler } from "./handlers/task-create";
import { createPlanCreateActionHandler } from "./handlers/plan-create";
import { createKnowledgeFlagActionHandler } from "./handlers/knowledge-flag";
import { createKnowledgeReviewActionHandler } from "./handlers/knowledge-review";
import type { FylloActionDispatchHandler } from "./types";
import { collectPendingFylloActions } from "../model/pending-actions";

function getDispatchHandler<Type extends FylloActionType>(
  handlers: {
    [T in FylloActionType]: FylloActionDispatchHandler<T>;
  },
  type: Type
): FylloActionDispatchHandler<Type> {
  return handlers[type] as FylloActionDispatchHandler<Type>;
}

/**
 * Compose the Fyllo action handler map for the current project/session context.
 *
 * Each enabled action type gets a handler wired with the stores/composables it needs.
 * `dispatchFylloAction` catches handler errors and normalizes them to a failed result so
 * the UI can show the error without unmounting.
 */
interface DispatcherContext {
  projectId?: string;
  sessionId?: string;
  actionId?: string;
}

const sessionIdErrorByType: Record<FylloActionType, string> = {
  "task.create": "当前聊天会话缺少 sessionId，无法创建任务。",
  "plan.create": "当前聊天会话缺少 sessionId，无法审阅规划。",
  "knowledge.flag": "当前聊天会话缺少 sessionId，无法沉淀知识。",
  "knowledge.review": "当前聊天会话缺少 sessionId，无法审阅知识。",
};

export function useFylloActionDispatcher(): {
  dispatchFylloAction: <Type extends FylloActionType>(
    type: Type,
    payload: FylloActionPayloadByType[Type],
    context?: DispatcherContext
  ) => Promise<FylloActionHandlerResult>;
  getPendingKnowledgeFlags: () => Array<{
    actionId: string;
    summary: string;
    contextPaths?: string[];
  }>;
} {
  const projectStore = useProjectStore();
  const sessionStore = useSessionStore();
  const chatStore = useChatStore();
  const lineageStore = useLineageStore();
  const { openPlanReview } = usePlanSlideover();
  const { openKnowledgeReview } = useKnowledgeReviewSlideover();

  function getPendingKnowledgeFlags(): Array<{
    actionId: string;
    summary: string;
    contextPaths?: string[];
  }> {
    const session = sessionStore.activeSession;
    return collectPendingFylloActions(session)
      .filter((action) => action.type === "knowledge.flag")
      .map((action) => ({
        actionId: action.actionId,
        summary: action.payload.summary,
        contextPaths: action.payload.contextPaths,
      }));
  }

  const handlers = {
    "task.create": createTaskCreateActionHandler({
      createSessionTask: lineageStore.createSessionTask,
      setSessionOriginTaskRef: sessionStore.setSessionOriginTaskRef,
    }),
    "plan.create": createPlanCreateActionHandler({
      openPlanReview: async (input) => {
        const result = await openPlanReview(input);
        return result.status === "approved" ? { status: "approved" } : { status: "dismissed" };
      },
    }),
    "knowledge.flag": createKnowledgeFlagActionHandler({
      getChatStatus: () => chatStore.chatStatus,
      getPendingKnowledgeFlags,
      sendMessageAndAwaitDurableAppend: chatStore.sendMessageAndAwaitDurableAppend,
    }),
    "knowledge.review": createKnowledgeReviewActionHandler({
      openKnowledgeReview: async (input) => {
        const result = await openKnowledgeReview(input);
        return result.status === "approved" ? { status: "approved" } : { status: "dismissed" };
      },
    }),
  } satisfies { [T in FylloActionType]: FylloActionDispatchHandler<T> };

  async function dispatchFylloAction<Type extends FylloActionType>(
    type: Type,
    payload: FylloActionPayloadByType[Type],
    context: DispatcherContext = {}
  ): Promise<FylloActionHandlerResult> {
    const sessionId = context.sessionId?.trim();
    if (!sessionId) {
      return {
        outcome: "failed",
        error: sessionIdErrorByType[type],
      };
    }

    try {
      const handler = getDispatchHandler(handlers, type);
      return await handler(payload, {
        context: {
          projectId: context.projectId ?? projectStore.currentProject?.id ?? "",
          sessionId,
          actionId: context.actionId ?? "",
        },
      });
    } catch (error) {
      return {
        outcome: "failed",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  return {
    dispatchFylloAction,
    getPendingKnowledgeFlags,
  };
}
