import { createPlanCreateActionHandler } from "@renderer/composables/fyllo-action-handlers/plan-create";
import { createTaskCreateActionHandler } from "@renderer/composables/fyllo-action-handlers/task-create";
import type {
  FylloActionDispatchContext,
  FylloActionDispatchHandler,
  FylloActionDispatchHandlerMap,
} from "@renderer/composables/fyllo-action-handlers/types";
import { usePlanSlideover } from "@renderer/composables/usePlanSlideover";
import { useLineageStore, useProjectStore, useSessionStore } from "@renderer/stores";
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

export function useFylloActionDispatcher(): {
  dispatchFylloAction: <Type extends FylloActionType>(
    type: Type,
    payload: FylloActionPayloadByType[Type],
    context?: FylloActionDispatchContext
  ) => Promise<FylloActionHandlerResult>;
} {
  const projectStore = useProjectStore();
  const sessionStore = useSessionStore();
  const lineageStore = useLineageStore();
  const { openPlanReview } = usePlanSlideover();
  const handlers = {
    "task.create": createTaskCreateActionHandler({
      createSessionTask: lineageStore.createSessionTask,
      setSessionOriginTaskRef: sessionStore.setSessionOriginTaskRef,
    }),
    "plan.create": createPlanCreateActionHandler({
      openPlanReview,
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
