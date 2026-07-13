import { createKnowledgeFlagActionHandler } from "@renderer/composables/fyllo-action-handlers/knowledge-flag";
import { createKnowledgeReviewActionHandler } from "@renderer/composables/fyllo-action-handlers/knowledge-review";
import { createPlanCreateActionHandler } from "@renderer/composables/fyllo-action-handlers/plan-create";
import { createTaskCreateActionHandler } from "@renderer/composables/fyllo-action-handlers/task-create";
import type {
  FylloActionDispatchContext,
  FylloActionDispatchHandler,
  FylloActionDispatchHandlerMap,
} from "@renderer/composables/fyllo-action-handlers/types";
import { usePlanSlideover } from "@renderer/composables/usePlanSlideover";
import { useKnowledgeReviewSlideover } from "@renderer/composables/useKnowledgeReviewSlideover";
import { useChatStore, useLineageStore, useProjectStore, useSessionStore } from "@renderer/stores";
import type {
  FylloActionHandlerResult,
  FylloActionPayloadByType,
  FylloActionType,
} from "@shared/types/fyllo-action";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getDispatchHandler<Type extends FylloActionType>(
  handlers: FylloActionDispatchHandlerMap,
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
export function useFylloActionDispatcher(): {
  dispatchFylloAction: <Type extends FylloActionType>(
    type: Type,
    payload: FylloActionPayloadByType[Type],
    context?: FylloActionDispatchContext
  ) => Promise<FylloActionHandlerResult>;
} {
  const projectStore = useProjectStore();
  const sessionStore = useSessionStore();
  const chatStore = useChatStore();
  const lineageStore = useLineageStore();
  const { openPlanReview } = usePlanSlideover();
  const { openKnowledgeReview } = useKnowledgeReviewSlideover();
  const handlers = {
    "task.create": createTaskCreateActionHandler({
      createSessionTask: lineageStore.createSessionTask,
      setSessionOriginTaskRef: sessionStore.setSessionOriginTaskRef,
    }),
    "plan.create": createPlanCreateActionHandler({
      openPlanReview,
    }),
    "knowledge.flag": createKnowledgeFlagActionHandler({
      getChatStatus: () => chatStore.chatStatus,
      getActiveSession: () => sessionStore.activeSession,
      sendMessage: chatStore.sendMessage,
    }),
    "knowledge.review": createKnowledgeReviewActionHandler({
      openKnowledgeReview,
    }),
  } satisfies FylloActionDispatchHandlerMap;

  async function dispatchFylloAction<Type extends FylloActionType>(
    type: Type,
    payload: FylloActionPayloadByType[Type],
    context: FylloActionDispatchContext = {}
  ): Promise<FylloActionHandlerResult> {
    try {
      const handler = getDispatchHandler(handlers, type);
      return await handler(payload, {
        projectId: projectStore.currentProject?.id,
        context,
      });
    } catch (error) {
      return {
        outcome: "failed",
        error: getErrorMessage(error),
      };
    }
  }

  return {
    dispatchFylloAction,
  };
}
